import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

export type AIProvider = "gemini" | "openai" | "anthropic";

export interface AIResponse {
  aiXml: string;
  aiJsx: string;
  aiCss?: string;
  dependencies?: Record<string, string>;
}

export async function generateWidgetCode(description: string, widgetName: string): Promise<AIResponse> {
  const provider = (process.env.AI_PROVIDER || "gemini") as AIProvider;
  
  const prompt = `
    You are an expert Mendix and React developer. Generate a fully functional, production-quality Mendix pluggable widget named "${widgetName}".

    Widget description: "${description}"

    Return a single valid JSON object with these keys:
    - "aiXml"  : The Mendix widget XML definition (src/${widgetName}.xml)
    - "aiJsx"  : The full React TSX component (src/${widgetName}.tsx)
    - "aiCss"  : (Optional) CSS string for styling. Include if the widget has custom styles.
    - "dependencies" : (Optional) Extra npm packages needed, e.g. { "date-fns": "^3.0.0" }

    ──────────────────────────────────────────
    XML RULES (src/${widgetName}.xml)
    ──────────────────────────────────────────
    - Root <widget> tag MUST have ALL of these attributes:
        id="com.widgetforge.${widgetName.toLowerCase()}.${widgetName}"
        pluginWidget="true"
        needsEntityContext="false"
        offlineCapable="true"
        supportedPlatform="Web"
        xmlns="http://www.mendix.com/widget/1.0/"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.mendix.com/widget/1.0/ ../node_modules/mendix/custom_widget.xsd"
    - Include <name>${widgetName}</name> and <description> inside <widget>.
    - Every <property> MUST be inside a <propertyGroup caption="..."> tag.
    - The ONLY valid child elements of <property> are <caption> and <description>.
    - "defaultValue" MUST be an XML attribute on <property>, never a child element.
    - "required" MUST be specified as a <property> attribute (true/false).
    - Valid property types: string, boolean, integer, decimal, action, attribute, expression, file, icon, object, widgets.
    - The <properties> element is ALWAYS required, even if the widget has no properties. In that case, use: <properties></properties>

    ──────────────────────────────────────────
    TSX RULES (src/${widgetName}.tsx)
    ──────────────────────────────────────────
    - Export a named function component: export function ${widgetName}({ ... }: Props) { ... }
    - ALWAYS define a Props interface whose fields match the XML properties.
    - You may use ANY React features: useState, useEffect, useRef, useCallback, useMemo, useReducer, custom hooks, context, etc.
    - You may make HTTP/fetch calls (useEffect + fetch) for real data (weather APIs, public REST APIs, etc.).
    - You may use complex UI patterns: modals, tabs, accordions, drag-and-drop, infinite scroll, virtual lists, etc.
    - For complex widgets (calendar, mailbox, forms, charts, etc.) implement full interactivity — don't stub or simplify.
    - If a 3rd-party library significantly improves quality (e.g. "react-calendar", "recharts", "date-fns"), include it in "dependencies" and import it in the JSX.
    - If you generate aiCss, import it: import "./ui/${widgetName}.css"; at the top of the TSX file.
    - Only import what you actually use. Unused imports break the build.
    - FORBIDDEN IMPORTS (will cause build failure — NEVER use these):
        ✗ import ... from "mendix"
        ✗ import ... from "mendix/custom-widget"
        ✗ import ... from "mendix/components/..."
        ✗ import ... from any "mendix/*" path
        ✗ import ... from "@mendix/pluggable-widgets-api" or any "@mendix/*" scoped package
        ✗ PageProps, ContainerProps, WidgetProps, ClassProperties (Mendix-internal types)
        ✗ createElement from "react" when using JSX syntax
    - Use React types (FC, ReactElement, CSSProperties, MouseEvent, etc.) from "react" if needed.
    - Inline styles are fine. CSS custom properties (e.g. var(--neon-color)) are encouraged for theming.

    ──────────────────────────────────────────
    QUALITY EXPECTATIONS
    ──────────────────────────────────────────
    - For a calendar widget: render a real monthly grid, clickable days, event support.
    - For a mailbox widget: show an inbox list, a reading pane, compose button, realistic mock data.
    - For a form widget: full validation, error messages, submit handler, accessible labels.
    - For a chart widget: use a library (recharts, chart.js) or draw on a <canvas>.
    - For a data widget: fetch from a public API, handle loading and error states.
    - In short: build a real, working widget — not a placeholder or a demo skeleton.

    Return raw JSON only, no markdown code blocks.
  `;


  switch (provider) {
    case "gemini":
      return await callGemini(prompt);
    case "openai":
      return await callOpenAI(prompt);
    case "anthropic":
      return await callAnthropic(prompt);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

async function callGemini(prompt: string): Promise<AIResponse> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env");
  
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // List of models to try if the primary one fails
  const modelsToTry = [
    process.env.GEMINI_MODEL,
    "gemini-2.5-flash", 
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-pro",
    "gemini-1.5-pro"
  ].filter(Boolean) as string[];

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.4,
          // Force pure JSON output — no markdown, no preamble, no backticks.
          // Supported by Gemini 1.5+ models.
          responseMimeType: 'application/json',
        } as any
      });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return parseAIResponse(text);
    } catch (error: any) {
      lastError = error;
      
      // If it's not a 404, throw immediately (e.g. auth error, quota error)
      if (!error.message.includes("404") && !error.message.includes("not found")) {
        throw error;
      }
      // If it is a 404, we continue to the next model in the list
    }
  }

  throw new Error(`[V2-Gemini] All models failed. Last error: ${lastError?.message}.`);
}

async function callOpenAI(prompt: string): Promise<AIResponse> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    
    const content = response.choices[0].message.content || "{}";
    return JSON.parse(content);
  } catch (e: any) {
    throw new Error(`[V2-OpenAI] OpenAI failed: ${e.message}`);
  }
}

async function callAnthropic(prompt: string): Promise<AIResponse> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : "{}";
  return parseAIResponse(text);
}

function parseAIResponse(text: string): AIResponse {
  // Step 1: Strip common markdown code-block wrappers
  let cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Step 2: Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Step 3: Fallback — extract first { ... } block from the text
    const match = cleaned.match(/{[\s\S]*}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        // fall through to final error
      }
    }
    console.error('Failed to parse AI response (first 500 chars):', cleaned.slice(0, 500));
    throw new Error('Invalid AI response format — could not extract JSON');
  }
}

export async function testAIConnection(): Promise<{ provider: string; model: string; status: string }> {
  const provider = (process.env.AI_PROVIDER || "gemini") as AIProvider;
  
  try {
    switch (provider) {
      case "gemini": {
        const apiKey = process.env.GEMINI_API_KEY || "";
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        const model = genAI.getGenerativeModel({ model: modelName });
        await model.generateContent("Respond with the word 'Ready'.");
        return { provider, model: modelName, status: "Ready" };
      }
      case "openai": {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const modelName = process.env.OPENAI_MODEL || "gpt-4o-mini";
        await openai.chat.completions.create({
          model: modelName,
          messages: [{ role: "user", content: "Respond with the word 'Ready'." }],
          max_tokens: 10,
        });
        return { provider, model: modelName, status: "Ready" };
      }
      case "anthropic": {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const modelName = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";
        await anthropic.messages.create({
          model: modelName,
          max_tokens: 10,
          messages: [{ role: "user", content: "Respond with the word 'Ready'." }],
        });
        return { provider, model: modelName, status: "Ready" };
      }
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  } catch (error: any) {
    throw new Error(`AI connectivity test failed for ${provider}: ${error.message}`);
  }
}
