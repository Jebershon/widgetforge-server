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
    XML RULES — MENDIX PLUGGABLE WIDGET DEFINITION
    Source: https://docs.mendix.com/apidocs-mxsdk/apidocs/pluggable-widgets-property-types/
    ════════════════════════════════════════════

    FULL DOCUMENT SKELETON (copy this structure exactly):
    <?xml version="1.0" encoding="utf-8"?>
    <widget id="com.widgetforge.${widgetName.toLowerCase()}.${widgetName}"
            pluginWidget="true"
            needsEntityContext="true"
            offlineCapable="true"
            supportedPlatform="${isNative ? 'Native' : 'Web'}"
            xmlns="http://www.mendix.com/widget/1.0/"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://www.mendix.com/widget/1.0/ ../node_modules/mendix/custom_widget.xsd">
        <name>${widgetName}</name>
        <description>${description.slice(0, 100)}</description>
        <properties>
            <propertyGroup caption="General">
                <!-- ALL properties go inside propertyGroup tags -->
            </propertyGroup>
        </properties>
    </widget>

    STRUCTURAL RULES:
    - <properties> is the ONLY container for <propertyGroup> elements.
    - <propertyGroup caption="..."> is the ONLY container for <property> and <systemProperty> elements.
    - PropertyGroups can nest: first-level = tabs in Studio Pro, second-level = boxes.
    - EVERY <property> MUST have child elements <caption> and <description>.

    ════════════════════════════════════════════
    COMPLETE PROPERTY TYPE REFERENCE (15 types)
    ════════════════════════════════════════════

    ── STATIC TYPES ──────────────────────────

    1. STRING
       XML attrs: key(req), type="string", defaultValue(opt), multiline="true|false"(opt), required="true|false"(opt)
       Child elements: <caption>(req), <description>(req)
       Example:
       <property key="myString" type="string" defaultValue="Hello">
           <caption>My string</caption>
           <description>A text setting</description>
       </property>

    2. BOOLEAN
       XML attrs: key(req), type="boolean", defaultValue="true|false"(req)
       Child elements: <caption>(req), <description>(req)
       Example:
       <property key="showHeader" type="boolean" defaultValue="true">
           <caption>Show header</caption>
           <description>Toggle header visibility</description>
       </property>

    3. INTEGER
       XML attrs: key(req), type="integer", defaultValue(req)
       Child elements: <caption>(req), <description>(req)
       Example:
       <property key="maxItems" type="integer" defaultValue="10">
           <caption>Max items</caption>
           <description>Maximum number of items</description>
       </property>

    4. DECIMAL
       XML attrs: key(req), type="decimal", defaultValue(req)
       Child elements: <caption>(req), <description>(req)
       Example:
       <property key="opacity" type="decimal" defaultValue="0.8">
           <caption>Opacity</caption>
           <description>Element opacity</description>
       </property>

    5. ENUMERATION
       XML attrs: key(req), type="enumeration", defaultValue(req — must match an enumerationValue key)
       Child elements: <caption>(req), <description>(req), <enumerationValues>(req)
       Example:
       <property key="size" type="enumeration" defaultValue="medium">
           <caption>Size</caption>
           <description>Widget size</description>
           <enumerationValues>
               <enumerationValue key="small">Small</enumerationValue>
               <enumerationValue key="medium">Medium</enumerationValue>
               <enumerationValue key="large">Large</enumerationValue>
           </enumerationValues>
       </property>

    ── COMPONENT TYPES ───────────────────────

    6. ICON
       XML attrs: key(req), type="icon", required="true|false"(opt, default true)
       Child elements: <caption>(req), <description>(req)
       Example:
       <property key="cardIcon" type="icon" required="false">
           <caption>Icon</caption>
           <description>Card icon</description>
       </property>

    7. IMAGE
       XML attrs: key(req), type="image", required="true|false"(opt), allowUpload="true|false"(opt)
       Child elements: <caption>(req), <description>(req)
       Example:
       <property key="bgImage" type="image" required="false">
           <caption>Background image</caption>
           <description>Background image</description>
       </property>

    8. WIDGETS (drop zone for child widgets)
       XML attrs: key(req), type="widgets", required="true|false"(opt), dataSource="<datasource_key>"(opt)
       Child elements: <caption>(req), <description>(req)
       Example:
       <property key="content" type="widgets" required="false">
           <caption>Content</caption>
           <description>Content of a box</description>
       </property>

    ── DYNAMIC TYPES ─────────────────────────

    9. EXPRESSION
       XML attrs: key(req), type="expression", defaultValue(opt), required="true|false"(opt), dataSource="<datasource_key>"(opt)
       Child elements: <caption>(req), <description>(req), <returnType>(req)
       <returnType> uses attribute type="String|Boolean|DateTime|Decimal|Integer"
       Example:
       <property key="barColor" type="expression" defaultValue="'blue'">
           <caption>Color</caption>
           <description>Progress bar CSS color</description>
           <returnType type="String" />
       </property>

    10. TEXT TEMPLATE
       XML attrs: key(req), type="textTemplate", multiline="true|false"(opt), required="true|false"(opt), dataSource="<datasource_key>"(opt)
       Child elements: <caption>(req), <description>(req), <translations>(opt)
       Example:
       <property key="label" type="textTemplate">
           <caption>Label</caption>
           <description>Card label</description>
       </property>

    11. ACTION
       XML attrs: key(req), type="action", required="true|false"(opt, default true), dataSource="<datasource_key>"(opt)
       Child elements: <caption>(req), <description>(req)
       NOTE: Do NOT add <returnType> to action properties.
       Example:
       <property key="onClick" type="action" required="false">
           <caption>On click</caption>
           <description>Action on click</description>
       </property>

    12. ATTRIBUTE  ★ THIS IS HOW YOU BIND TO MENDIX DATA ★
       XML attrs: key(req), type="attribute", onChange="<action_key>"(opt), required="true|false"(opt), dataSource="<datasource_key>"(opt)
       Child elements: <caption>(req), <description>(req), <attributeTypes>(req)
       <attributeTypes> contains one or more: <attributeType name="X"/>
       Valid names: AutoNumber, Binary, Boolean, DateTime, Enum, HashString, Integer, Long, String, Decimal
       Example:
       <property key="titleAttribute" type="attribute">
           <caption>Title</caption>
           <description>Attribute to be used as title</description>
           <attributeTypes>
               <attributeType name="String"/>
           </attributeTypes>
       </property>

    13. ASSOCIATION
       XML attrs: key(req), type="association", selectableObjects="<datasource_key>"(opt), onChange="<action_key>"(opt), required="true|false"(opt), dataSource="<datasource_key>"(opt)
       Child elements: <caption>(req), <description>(req), <associationTypes>(req)
       <associationTypes> contains: <associationType name="Reference"/> and/or <associationType name="ReferenceSet"/>
       Example:
       <property key="ref" type="association" selectableObjects="objSource">
           <caption>Reference</caption>
           <description>Reference</description>
           <associationTypes>
               <associationType name="Reference"/>
           </associationTypes>
       </property>

    14. OBJECT (configurable list of sub-properties)
       XML attrs: key(req), type="object", isList="true"(req), required="true|false"(opt)
       Child elements: <caption>(req), <description>(req), <properties>(req)
       The inner <properties> MUST contain <propertyGroup> wrapping sub-properties. Nested objects are NOT supported.
       Example:
       <property key="columns" type="object" isList="true">
           <caption>Columns</caption>
           <description>Column configuration</description>
           <properties>
               <propertyGroup caption="Column">
                   <property key="colHeader" type="string" defaultValue="Header">
                       <caption>Header</caption>
                       <description>Column header text</description>
                   </property>
                   <property key="colAttr" type="attribute" dataSource="YOUR_DATASOURCE_KEY">
                       <caption>Attribute</caption>
                       <description>Column data</description>
                       <attributeTypes>
                           <attributeType name="String"/>
                       </attributeTypes>
                   </property>
               </propertyGroup>
           </properties>
       </property>

    15. DATASOURCE
       XML attrs: key(req), type="datasource", isList="true"(req), required="true|false"(opt)
       Child elements: <caption>(req), <description>(req)
       Other properties can link to this via their dataSource="<this_key>" attribute.
       Example:
       <property key="data" type="datasource" isList="true" required="false">
           <caption>Data source</caption>
           <description>Data source for items</description>
       </property>

    16. SELECTION
       XML attrs: key(req), type="selection", dataSource="<datasource_key>"(req), onChange="<action_key>"(opt)
       Child elements: <caption>(req), <description>(req), <selectionTypes>(req)
       <selectionTypes> contains: <selectionType name="None|Single|Multi"/>
       Example:
       <property key="itemSelection" type="selection" dataSource="data">
           <caption>Selection</caption>
           <description>Row selection mode</description>
           <selectionTypes>
               <selectionType name="None" />
               <selectionType name="Single" />
           </selectionTypes>
       </property>

    17. FILE
       XML attrs: key(req), type="file", required="true|false"(opt), allowUpload="true|false"(opt)
       Child elements: <caption>(req), <description>(req)
       Example:
       <property key="uploadFile" type="file" required="false" allowUpload="true">
           <caption>File</caption>
           <description>File upload</description>
       </property>

    ── SYSTEM PROPERTIES ─────────────────────

    Place these inside a <propertyGroup> alongside regular properties:
    <systemProperty key="Label"/>
    <systemProperty key="Name"/>
    <systemProperty key="TabIndex"/>
    <systemProperty key="Visibility"/>
    <systemProperty key="Editability"/>

    ════════════════════════════════════════════
    ATTRIBUTE DATASOURCE BINDING RULE (STRICT)
    ════════════════════════════════════════════
    - ALWAYS bind attribute properties to a datasource when applicable.
    - If a property is inside an object/list (e.g., columns) and relates to row data, its <property type="attribute"> tag MUST have the dataSource="<datasource_property_key>" XML attribute.
    - If missing this binding, Mendix WILL NOT allow the user to select the attribute because it lacks list context.
    - Example: <property key="colAttr" type="attribute" dataSource="dataSourcePropKey">

    ════════════════════════════════════════════
    FORBIDDEN PATTERNS — WILL CAUSE XML ERRORS
    ════════════════════════════════════════════
    NEVER generate ANY of these child elements (they are NOT part of the Mendix XSD):
    <translatable>, <minimumValue>, <maximumValue>, <defaultValue> (as child element),
    <isList> (as child element), <required> (as child element), <isDefault>, <onChange> (as child element)

    These are ATTRIBUTES on the <property> tag, NOT child elements:
    CORRECT: <property key="x" type="string" required="false" defaultValue="hi">
    WRONG:   <property key="x" type="string"><required>false</required><defaultValue>hi</defaultValue></property>

    The ONLY valid child elements inside <property> are:
    <caption>, <description>, <attributeTypes>, <enumerationValues>, <returnType>,
    <associationTypes>, <selectionTypes>, <properties> (for object type only),
    <translations> (for textTemplate only), <actionVariables> (for action only)

    ════════════════════════════════════════════
    RELATIVE DATASOURCE PATH (CRITICAL)
    ════════════════════════════════════════════
    1. When a property is inside a type="object" (nested structure):
       - dataSource MUST be a RELATIVE PATH.
       - NOT the root key directly.
       - type="object" properties MUST NEVER include dataSource attribute themselves.
    2. Use:
       dataSource="../<datasource_key>"
    3. Example:
       ROOT:
       <property key="dataSource" type="datasource" isList="true" />
       INSIDE OBJECT:
       <property key="attribute" type="attribute" dataSource="../dataSource" />
    4. NEVER use:
       ❌ dataSource="dataSource"   (invalid inside object)
       ❌ dataSource="data"         (invalid unless exists)
    5. VALIDATION:
       - If attribute is inside object → MUST start with "../"
       - If at root level → MUST NOT use "../"

    FAILURE WILL CAUSE: "Invalid property path '<key>' in dataSource attribute"

    ════════════════════════════════════════════
    MANDATORY VALIDATION — MUST PASS BEFORE OUTPUT
    ════════════════════════════════════════════
    Before returning the final JSON, you MUST validate the XML:
    1. Scan ALL <property type="attribute"> occurrences.
    2. For EACH attribute property:
       - If ANY datasource exists in the widget (type="datasource"):
         → The attribute property MUST include the EXACT datasource key.
         → If nested in an object, it MUST be prefixed with "../" (e.g., dataSource="../gridDS").
    3. This rule applies EVEN IF:
       - The attribute is inside an object (type="object" isList="true")
       - The attribute is deeply nested inside propertyGroups
    4. If ANY attribute property is missing dataSource:
       → FIX IT BEFORE RETURNING OUTPUT
    5. NEVER assume default binding — Mendix DOES NOT auto-bind attributes.
    6. If multiple datasources exist:
       → Choose the most relevant one based on context (usually the main list datasource)
    7. FINAL CHECK:
       - ZERO attribute properties without dataSource
       - If any found → REWRITE XML before returning

    FAILURE TO FOLLOW THIS WILL BREAK THE WIDGET IN Mendix.

    ════════════════════════════════════════════
    SELF-CORRECTION LOOP
    ════════════════════════════════════════════
    After generating XML:
    Step 1: Validate attribute bindings
    Step 2: If invalid → regenerate ONLY XML section
    Step 3: Re-check again
    Step 4: Repeat until valid
    Do NOT return partially valid XML.

    ════════════════════════════════════════════
    TSX RULES (src/${widgetName}.tsx)
    ════════════════════════════════════════════

    ════════════════════════════════════════════
    STRICT TYPESCRIPT TYPING (MANDATORY)
    ════════════════════════════════════════════
    1. NEVER use implicit 'any' types.
       - ALL function parameters MUST have explicit types.
    2. This applies to:
       - Arrow functions
       - useCallback
       - map() callbacks
       - event handlers
       - inline functions
    3. Examples:
       ❌ WRONG: const handleChange = (value) => { ... }
       ✅ CORRECT: const handleChange = (value: number) => { ... }
    4. React Hooks:
       ❌ WRONG: useCallback((newPage) => { ... })
       ✅ CORRECT: useCallback((newPage: number) => { ... })
    5. Array mapping:
       ❌ WRONG: items.map(item => ...)
       ✅ CORRECT: items.map((item: any) => ...)
       OR better: items.map((item: MyType) => ...)
    6. If type is unknown:
       → Use "any" explicitly (NOT implicit)
       Example: (item: any)
    7. FINAL VALIDATION:
       - Scan for ALL function parameters
       - Ensure NONE are untyped
       - If found → FIX before returning
    FAILURE WILL CAUSE: TS7006: Parameter implicitly has an 'any' type

    ════════════════════════════════════════════
    ATTRIBUTE ACCESS RULE (CRITICAL)
    ════════════════════════════════════════════

    1. IF attribute is inside OBJECT (type="object", isList="true"):
       → Type is EditableValue<T>
       → Access using:
         attribute.value

       ❌ NEVER use:
         attribute.get(item)

    2. IF attribute is linked to DATASOURCE (root level):
       → Type is ListAttributeValue<T>
       → Access using:
         attribute.get(item).value

    3. VALIDATION:
       - If ".get(" is used → ensure type is ListAttributeValue
       - If type is EditableValue → ensure NO ".get(" usage

    FAILURE WILL CAUSE:
    TS2339: Property 'get' does not exist on type 'EditableValue'

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
      export interface ListAttributeValue<T> { get(item: any): EditableValue<T>; }
    - DATASOURCES vs OBJECT LISTS - CRITICAL DIFFERENCE:
      1. DATASOURCE (ListValue): Use props.myDataSource.items?.map(item => ...).
         Attributes linked to a datasource become ListAttributeValue, so you MUST use .get(item).
         Example: props.myLinkedAttr?.get(item)?.value
      2. OBJECT LIST (isList="true"): It's a standard array. Use props.myObjectList?.map(obj => ...).
         Attributes inside objects are passed as direct EditableValue (NOT ListAttributeValue).
         NEVER use .get(item) on them!
         Example: obj.myInnerAttr?.value
    - EDITABLEVALUE & ACTIONVALUE METHODS - NO HALLUCINATIONS:
      - EditableValue has a .value property to GET the value.
      - EditableValue has a .setValue(newValue) method to SET the value.
      - NEVER write .getValue() or .getValue(x). It DOES NOT EXIST in the Mendix API (TS2551).
      - ActionValue has an .execute() method. NEVER write .run() or .executeAction().
    - CRITICAL — REACT ERROR #31 PREVENTION:
      Objects are NOT valid React children. NEVER pass a raw object/item into createElement as a child.
      WRONG:   createElement("span", null, item)           // item is an object → React error #31
      WRONG:   createElement("span", null, props.myAttr)   // myAttr is an EditableValue object → error
      CORRECT: createElement("span", null, String(item.someField ?? ""))
      CORRECT: createElement("span", null, props.myAttr?.value ?? "")
      If unsure about a value's type, wrap it: String(value ?? "")
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

