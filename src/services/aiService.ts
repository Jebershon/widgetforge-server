import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

export type AIProvider = "gemini" | "openai" | "anthropic";

export interface AIResponse {
  aiXml: string;
  aiTsx: string;
  aiCss?: string;
  dependencies?: Record<string, string>;
}


export async function generateWidgetCode(
  description: string, 
  widgetName: string, 
  platform: 'web' | 'native' = 'web',
  provider: AIProvider = 'gemini',
  apiKey: string = '',
  modelName: string = ''
): Promise<AIResponse> {
  const providerToUse = provider || (process.env.AI_PROVIDER || "gemini") as AIProvider;
  const isNative = platform === 'native';
  
  const prompt = `
    ACT AS a Senior Mendix and React developer. Generate a production-ready Mendix 10 Pluggable Widget for WidgetForge.

    WIDGET NAME: ${widgetName}
    WIDGET FUNCTION: ${description}
    TARGET PLATFORM: ${platform.toUpperCase()}

    ════════════════════════════════════════════
    OUTPUT FORMAT — FOLLOW EXACTLY
    ════════════════════════════════════════════
    Return a single valid JSON object with these keys:
    - "aiXml": The Mendix widget XML definition (src/${widgetName}.xml)
    - "aiTsx": The React TSX component (src/${widgetName}.tsx)
    - "aiCss": ${isNative ? '""' : 'Scoped CSS component styles (src/ui/' + widgetName + '.css)'}
    - "dependencies": Extra npm packages needed, e.g. { "lucide-react": "*" } (empty object {} if none)


    ════════════════════════════════════════════
    XML RULES (src/${widgetName}.xml)
    ════════════════════════════════════════════
    - Root <widget> tag MUST have ALL of these attributes:
        id="com.widgetforge.${widgetName.toLowerCase()}.${widgetName}"
        pluginWidget="true"
        needsEntityContext="false"
        offlineCapable="true"
        supportedPlatform="${isNative ? 'Native' : 'Web'}"
        xmlns="http://www.mendix.com/widget/1.0/"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.mendix.com/widget/1.0/ ../node_modules/mendix/custom_widget.xsd"
    - Include <name>${widgetName}</name> and <description>${description.slice(0, 100)}</description> inside <widget>.
    
    CRITICAL STRUCTURAL SCHEMA (Follow this exactly):
    <widget id="..." ...>
      <name>...</name>
      <description>...</description>
      <properties>
        <propertyGroup caption="General">
          <property key="prop1" type="string" ...>
            <caption>...</caption>
            <description>...</description>
          </property>
        </propertyGroup>
      </properties>
    </widget>

    - ALL <propertyGroup> tags MUST be strictly nested directly inside the <properties> block. Do not orphan them.
    - Every <property> tag MUST be inside a <propertyGroup caption="..."> tag.

    VALID PROPERTY TYPES & STUCTURE EXAMPLES:
    1. string:      <property key="..." type="string" defaultValue="...">
    2. boolean:     <property key="..." type="boolean" defaultValue="true|false">
    3. integer:     <property key="..." type="integer" defaultValue="0">
    4. decimal:     <property key="..." type="decimal" defaultValue="0.0">
    5. textTemplate:<property key="..." type="textTemplate">
    6. action:      <property key="..." type="action">
                      <caption>...</caption><description>...</description>
                      <returnType type="Void" />
                    </property>
    7. attribute:   <property key="..." type="attribute">
                      <caption>...</caption><description>...</description>
                      <attributeTypes>
                        <attributeType name="String"/> <!-- or Integer, Boolean, DateTime, Decimal -->
                      </attributeTypes>
                    </property>
    8. enumeration: <property key="..." type="enumeration" defaultValue="Key1">
                      <caption>...</caption><description>...</description>
                      <enumerationValues>
                        <enumerationValue key="Key1">Label 1</enumerationValue>
                        <enumerationValue key="Key2">Label 2</enumerationValue>
                      </enumerationValues>
                    </property>
    9. datasource:  <property key="..." type="datasource" isList="true" required="false">
    10. widgets:    <property key="..." type="widgets" dataSource="[datasource_key]" required="false">
    11. object:     <property key="..." type="object" isList="true">
                      <caption>...</caption><description>...</description>
                      <properties>
                        <propertyGroup caption="Object properties">
                          <property key="..." type="string">...</property>
                        </propertyGroup>
                      </properties>
                    </property>
    12. icon:       <property key="..." type="icon" required="false">
    13. image:      <property key="..." type="image" allowUpload="true|false" required="false">
    14. file:       <property key="..." type="file" allowUpload="true|false" required="false">
    15. expression: <property key="..." type="expression" required="false">
                      <caption>...</caption><description>...</description>
                      <returnType type="String" /> <!-- or Boolean, DateTime, Decimal, Integer -->
                    </property>
    16. association:<property key="..." type="association" selectableObjects="[datasource_key]">
                      <caption>...</caption><description>...</description>
                      <associationTypes>
                        <associationType name="Reference"/> <!-- or ReferenceSet -->
                      </associationTypes>
                    </property>
    17. selection:  <property key="..." type="selection" dataSource="[datasource_key]">
                      <caption>...</caption><description>...</description>
                      <selectionTypes>
                        <selectionType name="Single" /> <!-- or Multi, None -->
                      </selectionTypes>
                    </property>
    - Any type not on this list (e.g. invalid hallucinated types) will crash Mendix.

    ════════════════════════════════════════════
    TSX RULES (src/${widgetName}.tsx)
    ════════════════════════════════════════════

    - Line 1 MUST be: import React, { createElement, useState, useRef, useEffect, useCallback } from "react";
    - Use createElement() for ALL elements. NEVER use JSX angle-bracket syntax (<div>, <span>, etc.).
    - Use a named export: export function ${widgetName}(props: ${widgetName}Props) { ... }
    - Define a Props interface matching the XML property keys.
    - DO NOT import CSS. Do NOT write: import "./ui/${widgetName}.css";
    - DO NOT import from "mendix/", "@mendix/", or use mx.ui.* globals.
    - MENDIX TYPE SHIMS: Since you cannot import from 'mendix', if your Props interface uses Mendix types, you MUST define them as empty interfaces or simple types at the top of the file. 
      Example: 
      export interface ActionValue { readonly canExecute: boolean; readonly isExecuting: boolean; execute(): void; }
      export interface EditableValue<T> { readonly value?: T; readonly readOnly: boolean; setValue(value?: T): void; }
      export interface ListValue { readonly items?: any[]; readonly status: string; }
    - ITERATING OVER LISTS:
      - If XML defines a "datasource" (ListValue), you MUST map over its items: props.myDataSource.items?.map(item => ...)
      - If XML defines an "object" with isList="true", it is a standard array: props.myObjectList?.map(item => ...)
    - CRITICAL — REACT ERROR #31 PREVENTION:
      Objects are NOT valid React children. NEVER pass a raw object/item into createElement as a child.
      WRONG:   createElement("span", null, item)           // item is an object → React error #31
      WRONG:   createElement("span", null, props.myAttr)   // myAttr is an EditableValue object → error
      CORRECT: createElement("span", null, String(item.someField ?? ""))
      CORRECT: createElement("span", null, props.myAttr?.value ?? "")
      Rules:
      - Always extract .value from EditableValue/DynamicValue before rendering.
      - When iterating datasource items, use the linked attribute getter (e.g. props.displayAttr?.get(item)?.value) or render a string/number, never the item object itself.
      - For object lists, access specific sub-property values (item.myKey), never render the whole item.
      - If unsure about a value's type, wrap it: String(value ?? "")
    - For STATIC widgets (like an India Blog with no inputs), avoid any Mendix properties in XML and Props. Just use a clean React component.
    ${isNative ? '- Use components from "react-native" (View, Text, StyleSheet).' : '- Use standard React/HTML tags (div, span, etc.) via createElement.'}


    ════════════════════════════════════════════
    CSS RULES (src/ui/${widgetName}.css)
    ════════════════════════════════════════════
    - EVERY selector must start with .widget-${widgetName.toLowerCase()}
    - Include root reset: .widget-${widgetName.toLowerCase()}, .widget-${widgetName.toLowerCase()} * { box-sizing: border-box; }

    Return raw JSON only, no markdown code blocks.
  `;


  switch (providerToUse) {
    case "gemini":
      return await callGemini(prompt, apiKey, modelName);
    case "openai":
      return await callOpenAI(prompt, apiKey, modelName);
    case "anthropic":
      return await callAnthropic(prompt, apiKey, modelName);
    default:
      throw new Error(`Unsupported AI provider: ${providerToUse}`);
  }
}

async function callGemini(prompt: string, apiKey: string, injectedModelName: string): Promise<AIResponse> {
  const keyToUse = apiKey || process.env.GEMINI_API_KEY || "";
  if (!keyToUse) throw new Error("Google Gemini API Key is missing. Please configure it in the UI.");
  
  const genAI = new GoogleGenerativeAI(keyToUse);
  
  // List of models to try if the primary one fails
  // If the user explicitly provided a model in the config, we should respect that and not fallback randomly.
  const modelsToTry = injectedModelName 
    ? [injectedModelName] 
    : [
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
          temperature: 0.4
        }
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

async function callOpenAI(prompt: string, apiKey: string, injectedModelName: string): Promise<AIResponse> {
  const keyToUse = apiKey || process.env.OPENAI_API_KEY || "";
  if (!keyToUse) throw new Error("OpenAI API Key is missing. Please configure it in the UI.");
  
  const openai = new OpenAI({ apiKey: keyToUse });
  try {
    const response = await openai.chat.completions.create({
      model: injectedModelName || process.env.OPENAI_MODEL || "gpt-4o",
      messages: [{ role: "user", content: prompt }]
    });
    
    const content = response.choices[0].message.content || "{}";
    return parseAIResponse(content);
  } catch (e: any) {
    throw new Error(`[V2-OpenAI] OpenAI failed: ${e.message}`);
  }
}

async function callAnthropic(prompt: string, apiKey: string, injectedModelName: string): Promise<AIResponse> {
  const keyToUse = apiKey || process.env.ANTHROPIC_API_KEY || "";
  if (!keyToUse) throw new Error("Anthropic API Key is missing. Please configure it in the UI.");
  
  const anthropic = new Anthropic({ apiKey: keyToUse });
  const response = await anthropic.messages.create({
    model: injectedModelName || process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307",
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

export async function testAIConnection(
  injectedProvider?: string,
  injectedApiKey?: string,
  injectedModelName?: string
): Promise<{ provider: string; model: string; status: string }> {
  const provider = (injectedProvider || process.env.AI_PROVIDER || "gemini") as AIProvider;
  
  try {
    switch (provider) {
      case "gemini": {
        const apiKey = injectedApiKey || process.env.GEMINI_API_KEY || "";
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelName = injectedModelName || process.env.GEMINI_MODEL || "gemini-2.5-flash";
        const model = genAI.getGenerativeModel({ model: modelName });
        await model.generateContent("Respond with the word 'Ready'.");
        return { provider, model: modelName, status: "Ready" };
      }
      case "openai": {
        const apiKey = injectedApiKey || process.env.OPENAI_API_KEY || "";
        if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
        const openai = new OpenAI({ apiKey });
        const modelName = injectedModelName || process.env.OPENAI_MODEL || "gpt-4o-mini";
        await openai.chat.completions.create({
          model: modelName,
          messages: [{ role: "user", content: "Respond with the word 'Ready'." }]
        });
        return { provider, model: modelName, status: "Ready" };
      }
      case "anthropic": {
        const apiKey = injectedApiKey || process.env.ANTHROPIC_API_KEY || "";
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
        const anthropic = new Anthropic({ apiKey });
        const modelName = injectedModelName || process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";
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

export async function getAvailableModels(
  injectedProvider?: string,
  injectedApiKey?: string
): Promise<string[]> {
  const provider = (injectedProvider || process.env.AI_PROVIDER || "gemini") as AIProvider;
  
  try {
    switch (provider) {
      case "gemini": {
        const apiKey = injectedApiKey || process.env.GEMINI_API_KEY || "";
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Gemini API error: ${response.statusText} - ${text}`);
        }
        const data = await response.json();
        // Return only the model identifiers that support generateContent without the "models/" prefix
        return data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace('models/', ''));
      }
      case "openai": {
        const apiKey = injectedApiKey || process.env.OPENAI_API_KEY || "";
        if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
        const openai = new OpenAI({ apiKey });
        const list = await openai.models.list();
        return list.data.map((m: any) => m.id);
      }
      case "anthropic": {
        const apiKey = injectedApiKey || process.env.ANTHROPIC_API_KEY || "";
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
        
        const anthropic = new Anthropic({ apiKey });
        const list = await anthropic.models.list();
        return list.data.map((m: any) => m.id);
      }
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  } catch (error: any) {
    throw new Error(`Failed to fetch models for ${provider}: ${error.message}`);
  }
}

