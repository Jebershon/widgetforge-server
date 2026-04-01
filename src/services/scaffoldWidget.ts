import fs from 'fs/promises';
import path from 'path';

interface ScaffoldOptions {
  widgetName: string;
  description: string;
  platform?: 'web' | 'native';
  organization?: string;
  version?: string;
  author?: string;
  copyright?: string;
  license?: string;
  dependencies?: Record<string, string>;
}

/**
 * Programmatically scaffolds a Mendix pluggable widget (TypeScript, Function, Web/Native, Empty).
 * This replaces the interactive @mendix/generator-widget CLI.
 */
export async function scaffoldWidget(outputDir: string, opts: ScaffoldOptions): Promise<void> {
  const {
    widgetName,
    description,
    platform = 'web',
    organization = 'com.widgetforge',
    version = '1.0.0',
    author = 'widgetforge by Jebershon vetha singh',
    copyright = '© widgetforge by Jebershon vetha singh 2026. All rights reserved.',
    license = 'Apache-2.0',
    dependencies: customDependencies = {},
  } = opts;

  const packageName = widgetName.toLowerCase();
  const packagePath = organization.trim().toLowerCase();
  const packagePathXml = packagePath.replace(/\./g, '/');

  const isNative = platform === 'native';

  // Create directory structure
  await fs.mkdir(path.join(outputDir, 'src', 'components'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'src', 'ui'), { recursive: true });

  // 1. package.json
  const packageJson = {
    name: packageName,
    widgetName: widgetName,
    version: version,
    description: description,
    copyright: copyright,
    author: author,
    engines: { node: '>=16' },
    license: license,
    config: {
      projectPath: './tests/testProject',
      mendixHost: 'http://localhost:8080',
      developmentPort: 3000,
    },
    packagePath: packagePath,
    scripts: {
      start: `pluggable-widgets-tools start:${platform}`,
      dev: `pluggable-widgets-tools start:${platform}`,
      build: `pluggable-widgets-tools build:${platform}`,
      lint: 'pluggable-widgets-tools lint',
      'lint:fix': 'pluggable-widgets-tools lint:fix',
      prerelease: 'npm run lint',
      release: `pluggable-widgets-tools release:${platform}`,
    },
    devDependencies: {
      '@mendix/pluggable-widgets-tools': '^11.6.0',
      '@types/big.js': '^6.0.2',
    },
    dependencies: {
      classnames: '^2.2.6',
      ...(isNative ? { "react-native": "*" } : {}),
      ...customDependencies,
    },
    resolutions: {
      react: '19.0.0',
      'react-dom': '19.0.0',
      '@types/react': '19.0.0',
      '@types/react-dom': '19.0.0',
    },
    overrides: {
      react: '19.0.0',
      'react-dom': '19.0.0',
      '@types/react': '19.0.0',
      '@types/react-dom': '19.0.0',
    },
  };
  await fs.writeFile(
    path.join(outputDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // 2. tsconfig.json
  const tsconfig = {
    extends: '@mendix/pluggable-widgets-tools/configs/tsconfig.base',
    compilerOptions: {
      baseUrl: './',
      noUnusedLocals: false,
      noUnusedParameters: false,
      ...(isNative ? {
        jsx: 'react-native',
        target: 'esnext',
        module: 'esnext',
        lib: ['esnext']
      } : {})
    },
    include: ['./src', './typings'],
  };
  await fs.writeFile(
    path.join(outputDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  // 3. src/package.xml
  const packageXml = `<?xml version="1.0" encoding="utf-8" ?>
<package xmlns="http://www.mendix.com/package/1.0/">
    <clientModule name="${widgetName}" version="${version}" xmlns="http://www.mendix.com/clientModule/1.0/">
        <widgetFiles>
            <widgetFile path="${widgetName}.xml"/>
        </widgetFiles>
        <files>
            <file path="${packagePathXml}/${packageName}/${widgetName}.js"/>
            ${!isNative ? `<file path="${packagePathXml}/${packageName}/ui/${widgetName}.css"/>` : ''}
        </files>
    </clientModule>
</package>
`;
  await fs.writeFile(path.join(outputDir, 'src', 'package.xml'), packageXml);

  // 4. src/WidgetName.xml
  const nameCamelCase = widgetName.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const widgetXml = `<?xml version="1.0" encoding="utf-8"?>
<widget id="${packagePath}.${packageName}.${widgetName}" pluginWidget="true" needsEntityContext="true" offlineCapable="true"
        supportedPlatform="${isNative ? 'Native' : 'Web'}"
        xmlns="http://www.mendix.com/widget/1.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.mendix.com/widget/1.0/ ../node_modules/mendix/custom_widget.xsd">
    <name>${nameCamelCase}</name>
    <description>${description}</description>
    <icon/>
    <properties>
        <propertyGroup caption="General">
            <property key="sampleText" type="string" required="false">
                <caption>Default value</caption>
                <description>Sample text input</description>
            </property>
        </propertyGroup>
    </properties>
</widget>
`;
  await fs.writeFile(path.join(outputDir, 'src', `${widgetName}.xml`), widgetXml);

  // 5. src/WidgetName.tsx
  const webBoilerplate = `import { FunctionComponent } from "react";
 
export function ${widgetName}() {
    return <div className="widget-${packageName}">Hello from ${widgetName}</div>;
}
`;
  const nativeBoilerplate = `import { ReactElement, createElement } from "react";
import { View, Text } from "react-native";

export function ${widgetName}(): ReactElement {
    return (
        <View>
            <Text>Hello from ${widgetName} Native</Text>
        </View>
    );
}
`;
  await fs.writeFile(path.join(outputDir, 'src', `${widgetName}.tsx`), isNative ? nativeBoilerplate : webBoilerplate);

  // 6. src/WidgetName.editorPreview.tsx (minimal)
  const editorPreview = `import { createElement } from "react";

export function preview() {
    return createElement("div", {}, "Preview not available");
}

export function getPreviewCss(): string {
    return "";
}
`;
  await fs.writeFile(path.join(outputDir, 'src', `${widgetName}.editorPreview.tsx`), editorPreview);

  // 7. src/WidgetName.editorConfig.ts (minimal)
  const editorConfig = `export function getProperties(_values: any, defaultProperties: any): any[] {
    return defaultProperties;
}
`;
  await fs.writeFile(path.join(outputDir, 'src', `${widgetName}.editorConfig.ts`), editorConfig);

  // 8. src/ui/WidgetName.css
  if (!isNative) {
    await fs.writeFile(path.join(outputDir, 'src', 'ui', `${widgetName}.css`), ``);
  }
}
