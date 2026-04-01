import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { generateWidgetCode, testAIConnection, getAvailableModels } from './services/aiService';
import { scaffoldWidget } from './services/scaffoldWidget';

dotenv.config();

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors({
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());
app.get('/', (req: Request, res: Response) => {
  res.send('<h1>🚀 WidgetForge API</h1><p>The backend is live and ready to bundle widgets.</p>');
});

// --- Routes ---
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'WidgetForge Generator Backend is running.' });
});

app.post('/api/ai/test', async (req: Request, res: Response) => {
  try {
    const { aiProvider, apiKey, aiModel } = req.body;
    const result = await testAIConnection(
      aiProvider as string,
      apiKey as string,
      aiModel as string
    );
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/models', async (req: Request, res: Response) => {
  try {
    const { aiProvider, apiKey } = req.body;
    const models = await getAvailableModels(
      aiProvider as string,
      apiKey as string
    );
    res.json({ success: true, models });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Shared Core Build Logic ---
async function buildWidgetPackage(
  widgetName: string,
  description: string,
  aiXml: string,
  aiTsx: string,
  res: Response,
  platform: 'web' | 'native' = 'web',
  aiCss?: string,
  dependencies?: Record<string, string>,
  utilFiles?: Array<{ name: string; content: string }>
) {

  console.log(`Initiating build for ${widgetName}`);
  const tempDir = path.join(__dirname, '..', 'temp', `${Date.now()}-${widgetName}`);

  try {
    // Phase 1: Scaffold
    console.log(`[1/4] Scaffolding widget: ${widgetName} (${platform})`);
    const genDir = path.join(tempDir, widgetName);
    await scaffoldWidget(genDir, { widgetName, description, platform, dependencies });

    // Phase 2: Inject AI-generated code
    console.log(`[2/4] Injecting generated code...`);

    // --- Write uploaded utility files ---
    if (utilFiles && utilFiles.length > 0) {
      const utilsDir = path.join(genDir, 'src', 'utils');
      await fs.mkdir(utilsDir, { recursive: true });
      for (const u of utilFiles) {
        await fs.writeFile(path.join(utilsDir, u.name), u.content, 'utf-8');
        console.log(`  [util] Wrote src/utils/${u.name}`);
      }
    }

    // --- XML Corrections ---
    const xmlFile = path.join(genDir, 'src', `${widgetName}.xml`);
    const expectedId = `com.widgetforge.${widgetName.toLowerCase()}.${widgetName}`;
    let finalXml = aiXml;

    // Fix widget ID in the root <widget> tag
    if (!finalXml.includes(`id="${expectedId}"`)) {
      finalXml = finalXml.replace(/(<widget\s+[^>]*?id=")[^"]*(")/i, `$1${expectedId}$2`);
    }

    // Extreme XML Normalization: Safely gather all property-related tags from anywhere
    let extractedPropertiesHtml = '';
    
    // 1. Extract what's currently inside <properties></properties>
    const propertiesMatch = finalXml.match(/<properties>([\s\S]*?)<\/properties>/i);
    if (propertiesMatch) {
      extractedPropertiesHtml += propertiesMatch[1];
      finalXml = finalXml.replace(/<properties>[\s\S]*?<\/properties>/i, '');
    }

    // 2. Extract any surviving <propertyGroup> tags iteratively to avoid greedy regex bugs
    let pgMatch;
    while ((pgMatch = finalXml.match(/<propertyGroup[\s\S]*?<\/propertyGroup>/i))) {
      extractedPropertiesHtml += "\n" + pgMatch[0];
      finalXml = finalXml.replace(pgMatch[0], '');
    }

    // 3. Extract any surviving independent <property> tags
    let pMatch;
    while ((pMatch = finalXml.match(/<property[\s\S]*?<\/property>/i))) {
      extractedPropertiesHtml += "\n" + pMatch[0];
      finalXml = finalXml.replace(pMatch[0], '');
    }

    // Ensure missing/empty <propertyGroup caption> attributes are normalized
    extractedPropertiesHtml = extractedPropertiesHtml.replace(/<propertyGroup\s*>/g, '<propertyGroup caption="General">');
    extractedPropertiesHtml = extractedPropertiesHtml.replace(/<propertyGroup\s+caption=["']['"]?\s*>/g, '<propertyGroup caption="General">');

    // If there are properties but NO propertyGroup wrappers AT ALL, wrap everything
    if (extractedPropertiesHtml.includes('<property') && !extractedPropertiesHtml.includes('<propertyGroup')) {
      extractedPropertiesHtml = `        <propertyGroup caption="General">\n${extractedPropertiesHtml}\n        </propertyGroup>`;
    }

    // 3. Re-inject all properties cleanly formatted back into the <widget>
    finalXml = finalXml.replace(
      /(<\/widget>)/i,
      `    <properties>\n${extractedPropertiesHtml}\n    </properties>\n$1`
    );

    // Remove invalid XML child elements generated by AI
    const invalidTags = ['translatable', 'minimumValue', 'maximumValue', 'defaultValue', 'isList', 'required', 'isDefault', 'onChange'];
    invalidTags.forEach(tag => {
      finalXml = finalXml.replace(new RegExp(`\\s*<${tag}>[\\s\\S]*?<\\/${tag}>\\s*`, 'gi'), '');
      finalXml = finalXml.replace(new RegExp(`\\s*<${tag}\\s*\\/?>\\s*`, 'gi'), '');
    });

    // --- XML Finalization ---
    // 1. Remove any existing XML declarations (case-insensitive)
    finalXml = finalXml.replace(/<\?xml[\s\S]*?\?>/gi, '');
    
    // 2. Remove any comments that might be at the very top (before the root tag)
    finalXml = finalXml.replace(/^\s*<!--[\s\S]*?-->\s*/, '');

    // 3. Trim and prepend the required declaration
    finalXml = `<?xml version="1.0" encoding="utf-8"?>\n` + finalXml.trim();

    await fs.writeFile(xmlFile, finalXml);

    // --- TSX Corrections ---
    const entryFile = path.join(genDir, 'src', `${widgetName}.tsx`);
    let cleanedTsx = aiTsx.replace(
      /import\s+\{\s*([^}]*)\s*\}\s+from\s+['"]react['"];?/g,
      (match, p1) => {
        const imports = p1.split(',').map((s: string) => s.trim()).filter((s: string) => s !== 'createElement');
        return imports.length === 0 ? '' : `import { ${imports.join(', ')} } from "react";`;
      }
    );

    // Inject CSS import if provided
    if (aiCss && !cleanedTsx.includes(`./ui/${widgetName}.css`)) {
      cleanedTsx = `import "./ui/${widgetName}.css";\n` + cleanedTsx;
    }

    // Safety net: strip any mendix/* or @mendix/* imports the AI may have hallucinated.
    // These modules do not exist in the widget scaffold and will break the build.
    cleanedTsx = cleanedTsx.replace(/^import\s+.*from\s+['"]((?:@mendix|mendix)[^'"]*)['"];?\s*$/gm, '');

    // No watermark injection for TSX

    await fs.writeFile(entryFile, cleanedTsx);


    if (aiCss) {
      await fs.writeFile(path.join(genDir, 'src', 'ui', `${widgetName}.css`), aiCss);
    }

    // Phase 3: Install & Build
    try {
      await execAsync('npm install --legacy-peer-deps', {
        cwd: genDir,
        timeout: 600000,
        env: { ...process.env, CI: 'true' }
      });
    } catch (installErr: any) {
      const details = installErr.stderr || installErr.stdout || installErr.message;
      throw new Error(`npm install failed: ${details.slice(0, 1000)}`);
    }

    // Phase 3: Install & Build
    try {
      const buildCmd = platform === 'native' ? 'npm run build' : 'echo y | npm run build';
      console.log(`[3/4] Building widget... (${buildCmd})`);
      await execAsync(buildCmd, {
        cwd: genDir,
        timeout: 600000,
        env: { ...process.env, CI: 'true' }
      });
    } catch (buildErr: any) {
      // Return the raw stderr/stdout for better debugging in the UI
      const details = buildErr.stderr || buildErr.stdout || buildErr.message;
      throw new Error(details); 
    }

    // Inject CSS into the generated MPK (Mendix build tools omit it by default for Web)
    if (aiCss && platform === 'web') {
      try {
        const packagePathXml = 'com/widgetforge';
        const packageName = widgetName.toLowerCase();
        const sourceCssFile = path.join(genDir, 'src', 'ui', `${widgetName}.css`);

        // Locate the generated .mpk file dynamically
        const distDir = path.join(genDir, 'dist');
        const allDistFiles = await fs.readdir(distDir, { recursive: true });
        const mpkFilename = (allDistFiles as string[]).find(f => f.endsWith('.mpk'));
        if (!mpkFilename) throw new Error('Could not find generated .mpk in dist/');

        const finalMpkPath = path.resolve(distDir, mpkFilename);
        const cssBuffer = await fs.readFile(sourceCssFile);
        const zipCssPath = `${packagePathXml}/${packageName}/ui/${widgetName}.css`;

        const AdmZip = require('adm-zip');
        const zip = new AdmZip(finalMpkPath);

        // Add the CSS file to the archive
        zip.addFile(zipCssPath, cssBuffer, 'Injected by WidgetForge');

        // Update package.xml manifest to reference the CSS file
        let packageXmlContent = zip.readAsText('package.xml');
        if (packageXmlContent && !packageXmlContent.includes(`${widgetName}.css`)) {
          packageXmlContent = packageXmlContent.replace(
            '</files>',
            `    <file path="${zipCssPath}"/>\n        </files>`
          );
          zip.updateFile('package.xml', Buffer.from(packageXmlContent));
        }

        zip.writeZip(finalMpkPath);
      } catch (cssErr: any) {
        // Non-fatal: widget will load, but styles may be missing
        console.warn('[WARN] CSS injection into MPK failed:', cssErr.message);
      }
    }

    // Phase 4: Send the .mpk file
    console.log(`[4/4] Sending widget package...`);
    const distDirFinal = path.join(genDir, 'dist');
    const allDistFilesFinal = await fs.readdir(distDirFinal, { recursive: true });
    const mpkFilenameFinal = (allDistFilesFinal as string[]).find(f => f.endsWith('.mpk'));

    if (!mpkFilenameFinal) {
      throw new Error('Failed to find generated .mpk file in dist');
    }

    const mpkPathFinal = path.resolve(distDirFinal, mpkFilenameFinal);
    const mpkBaseName = path.basename(mpkFilenameFinal);
    res.download(mpkPathFinal, mpkBaseName, async (err) => {
      if (err) console.error('Download Error:', err);
      // Clean up temp build dir after download completes
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('Cleanup warning:', cleanupErr);
      }
    });

  } catch (error: any) {
    console.error('Build Error:', error?.message || error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to build widget', details: error?.message });
    }
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (_) { }
  }
}

// --- Route 1: AI Generation Mode ---
app.post('/api/generate', async (req: Request, res: Response) => {
  const { widgetName, description, platform, aiProvider, apiKey, aiModel } = req.body;

  if (!widgetName || !description) {
    return res.status(400).json({ error: 'widgetName and description are required' });
  }

  try {
    const aiResponse = await generateWidgetCode(description, widgetName, platform || 'web', aiProvider, apiKey, aiModel);
    res.json(aiResponse);
  } catch (error: any) {
    console.error('AI Generation Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate widget via AI', details: error?.message });
    }
  }
});


// --- Route 2: Manual Bundle Mode ---
app.post('/api/bundle', async (req: Request, res: Response) => {
  const { widgetName, description, aiXml, aiTsx, aiCss, dependencies, platform, utilFiles } = req.body;

  if (!widgetName || !description || !aiXml || !aiTsx) {
    return res.status(400).json({ error: 'widgetName, description, aiXml, and aiTsx are required for bundling' });
  }

  try {
    await buildWidgetPackage(widgetName, description, aiXml, aiTsx, res, platform || 'web', aiCss, dependencies, utilFiles);

  } catch (error: any) {
    console.error('Manual Bundle Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to bundle widget', details: error?.message });
    }
  }
});

// --- Start the Server ---
app.listen(PORT, () => {
  console.log(`✅ WidgetForge server running on http://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
