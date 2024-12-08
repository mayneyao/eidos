import { uiConfig } from "@/components/ui";
import { generateCacheKey, getCache, hasCache, setCache } from "./cache";
import { compilerInitialized, initializeCompiler, transform } from "./esbuild";


interface CompileOptions {
  uiLibCode?: string;
}

interface CompileResult {
  code: string;
  error: string | null;
}

export const compileCode = async (
  sourceCode: string,
  options: CompileOptions = {}
): Promise<CompileResult> => {
  if (!compilerInitialized) {
    await initializeCompiler()
  }
  const { uiLibCode = "" } = options;

  try {
    const reactImportRegex =
      /import\s+(?:\*\s+as\s+)?React(?:\s*,\s*\{[^}]*\})?\s+from\s+['"]react['"]/;
    const hasReactImport = reactImportRegex.test(sourceCode);

    const reactBanner = hasReactImport ? "" : `import React from 'react';\n`;

    const jsxResult = await transform(sourceCode, {
      loader: "tsx",
      target: "esnext",
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      banner: reactBanner + uiLibCode,
      minify: false,
      keepNames: true,
      charset: "utf8",
    });


    return {
      code: jsxResult.code,
      error: null,
    };
  } catch (err: any) {
    return { code: "", error: err.message };
  }
};

export function getImportsFromCode(code: string) {
  const importRegex = /import\s+[\s\S]*?\s+from\s+['"](.*?)['"];?/g;
  const imports = [];
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    imports.push(match[1]);
  }

  return Array.from(new Set(imports));
}

const uiLibsRegistry = new Map<string, string>();
const utilsCode = `
import {  clsx } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs) {
return twMerge(clsx(inputs))
}
`;

const utilsBlob = new Blob([utilsCode], {
  type: "application/javascript;charset=utf-8",
});
const utilsUrl = URL.createObjectURL(utilsBlob);

export async function generateImportMap(
  thirdPartyLibs: string[],
  uiLibs: string[]
) {
  const moduleRegistry = new Map();
  const imports: Record<string, string> = {
    react: "https://esm.sh/react@18.3.1",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
    clsx: "https://esm.sh/clsx@2.1.1",
    "tailwind-merge": "https://esm.sh/tailwind-merge",
    "@/lib/utils": utilsUrl,
  };

  thirdPartyLibs.forEach((dep) => {
    // skip react and react-dom
    if (dep === "react" || dep === "react-dom") return;
    imports[dep] = `https://esm.sh/${dep}`;
  });

  for (const dep of uiLibs) {
    const componentId = `@/components/ui/${dep}`;

    let url = uiLibsRegistry.get(componentId);

    if (!url) {
      const code = uiConfig[dep as keyof typeof uiConfig];
      const cacheKey = generateCacheKey(code);
      let compiledCode: CompileResult;
      if (hasCache(cacheKey)) {
        compiledCode = getCache(cacheKey);
      } else {
        compiledCode = await compileCode(code);
        setCache(cacheKey, compiledCode);
      }
      if (compiledCode.error) {
        throw new Error(compiledCode.error);
      }
      const blob = new Blob([compiledCode.code], {
        type: "application/javascript;charset=utf-8",
      });
      url = URL.createObjectURL(blob);
      uiLibsRegistry.set(componentId, url);
    }

    moduleRegistry.set(componentId, url);
    imports[componentId] = url;
  }

  const importMapScript = `
  <script type="importmap">
    ${JSON.stringify({ imports })}
  </script>
  `;


  return {
    importMap: importMapScript,
    cleanup: () => {
      moduleRegistry.forEach((url) => {
        if (!uiLibsRegistry.has(url)) {
          URL.revokeObjectURL(url);
        }
      });
    },
  };
}

export function getAllLibs(code: string, processedComponents = new Set<string>()) {
  if (!code) return {
    thirdPartyLibs: [],
    uiLibs: [],
  }

  const dependencies = getImportsFromCode(code);
  const thirdPartyLibs =
    dependencies?.filter((dep) => !dep.startsWith("@/")) ?? [];
  const uiLibs =
    dependencies
      ?.filter((dep) => dep.startsWith("@/components/ui"))
      .map((dep) => dep.replace("@/components/ui/", "")) ?? [];

  for (const component of uiLibs) {
    if (processedComponents.has(component)) continue;
    processedComponents.add(component);
    const code = uiConfig[component as keyof typeof uiConfig];
    const { thirdPartyLibs: _thirdPartyLibs, uiLibs: _uiLibs } = getAllLibs(code, processedComponents);
    thirdPartyLibs.push(..._thirdPartyLibs);
    uiLibs.push(..._uiLibs);
  }

  return {
    thirdPartyLibs: Array.from(new Set(thirdPartyLibs)),
    uiLibs: Array.from(new Set(uiLibs)),
  };
}

