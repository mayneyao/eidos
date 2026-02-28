import fs from "fs/promises"
import path from "path"
import { transform } from "esbuild"

const UI_COMPONENTS_DIR = path.join(
  process.cwd(),
  "apps",
  "web-app",
  "components",
  "ui"
)
const OUTPUT_DIR = path.join(
  process.cwd(),
  "apps",
  "web-app",
  "public",
  "compiled-ui"
)

interface CompileResult {
  code: string
  error: string | null
}

const utilsCode = `
import {  clsx } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs) {
return twMerge(clsx(inputs))
}
`

function getImportsFromCode(code: string) {
  const importRegex = /import\s+[\s\S]*?\s+from\s+['"](.*?)['"];?/g
  const imports = []
  let match

  while ((match = importRegex.exec(code)) !== null) {
    imports.push(match[1])
  }

  return Array.from(new Set(imports))
}

async function getAllLibs(
  code: string,
  processedComponents = new Set<string>()
) {
  if (!code)
    return {
      thirdPartyLibs: [],
      uiLibs: [],
    }

  const dependencies = getImportsFromCode(code)
  const thirdPartyLibs =
    dependencies?.filter((dep) => !dep.startsWith("@/")) ?? []
  const uiLibs =
    dependencies
      ?.filter((dep) => dep.startsWith("@/components/ui"))
      .map((dep) => dep.replace("@/components/ui/", "")) ?? []

  for (const component of uiLibs) {
    if (processedComponents.has(component)) continue
    processedComponents.add(component)
    const code = await getUiSourceCode(component)
    const { thirdPartyLibs: _thirdPartyLibs, uiLibs: _uiLibs } =
      await getAllLibs(code, processedComponents)
    thirdPartyLibs.push(..._thirdPartyLibs)
    uiLibs.push(..._uiLibs)
  }

  return {
    thirdPartyLibs: Array.from(new Set(thirdPartyLibs)),
    uiLibs: Array.from(new Set(uiLibs)),
  }
}

const compileCode = async (sourceCode: string): Promise<CompileResult> => {
  const uiLibCode = ""
  try {
    const reactImportRegex =
      /import\s+(?:\*\s+as\s+)?React(?:\s*,\s*\{[^}]*\})?\s+from\s+['"]react['"]/
    const hasReactImport = reactImportRegex.test(sourceCode)

    const reactBanner = hasReactImport ? "" : `import React from 'react';\n`

    const jsxResult = await transform(sourceCode, {
      loader: "tsx",
      target: "es2020",
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      banner: reactBanner + uiLibCode,
      minify: false,
      keepNames: true,
      charset: "utf8",
    })

    return {
      code: jsxResult.code,
      error: null,
    }
  } catch (err: any) {
    return { code: "", error: err.message }
  }
}

async function getUiSourceCode(componentName: string) {
  const filePath = path.join(UI_COMPONENTS_DIR, `${componentName}.tsx`)
  const sourceCode = await fs.readFile(filePath, "utf-8")
  return sourceCode
}

async function main() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true })
    console.log(`Output directory ${OUTPUT_DIR} ensured.`)

    const dirents = await fs.readdir(UI_COMPONENTS_DIR, { withFileTypes: true })
    const filesToCompile = dirents
      .filter((dirent) => dirent.isFile())
      .map((dirent) => dirent.name)
      .filter(
        (name) =>
          (name.endsWith(".tsx") || name.endsWith(".ts")) &&
          name !== "index.ts" &&
          name !== "readme.md"
      )

    if (filesToCompile.length === 0) {
      console.log(
        `No .ts or .tsx files found in ${UI_COMPONENTS_DIR} to compile (excluding index.ts, readme.md).`
      )
      return
    }

    console.log(
      `Found files to compile in ${UI_COMPONENTS_DIR}:`,
      filesToCompile
    )

    // write utils code to dist/compiled-ui/utils.js
    await fs.writeFile(path.join(OUTPUT_DIR, "utils.js"), utilsCode)

    const allDependencies: Record<
      string,
      { thirdPartyLibs: string[]; uiLibs: string[] }
    > = {}
    for (const fileName of filesToCompile) {
      console.log(`Processing ${fileName}...`)
      const componentName = path.parse(fileName).name

      // We need the actual source code of the component file, not from uiComponentsConfig
      // uiComponentsConfig seems to hold already processed/stringified code.
      // We should read the file content directly.
      const filePath = path.join(UI_COMPONENTS_DIR, fileName)
      console.log(`Processing ${filePath}...`)

      try {
        const sourceCode = await fs.readFile(filePath, "utf-8")

        // Check if the component exists in uiComponentsConfig to potentially get uiLibCode if needed by compileCode
        // However, the original request implies direct compilation of file content.
        // The `compileCode` function takes an optional `uiLibCode`.
        // For now, let's assume no specific uiLibCode is needed per file beyond what compileCode handles by default.

        const compileResult = await compileCode(sourceCode)

        if (compileResult.error) {
          console.error(`Error compiling ${fileName}:`, compileResult.error)
        } else {
          const outputFileName = `${componentName}.js`
          const outputPath = path.join(OUTPUT_DIR, outputFileName)
          await fs.writeFile(outputPath, compileResult.code)
          console.log(`Successfully compiled ${fileName} to ${outputPath}`)
        }

        // Generate and print dependency information
        try {
          const { thirdPartyLibs, uiLibs } = await getAllLibs(sourceCode)
          console.log(`
Dependencies for ${componentName} (${fileName}):`)
          console.log(
            `  Third-party libraries: ${thirdPartyLibs.length > 0 ? thirdPartyLibs.join(", ") : "None"}`
          )
          console.log(
            `  UI libraries: ${uiLibs.length > 0 ? uiLibs.join(", ") : "None"}`
          )

          // write to dist/compiled-ui/<componentName>.json
          const dependencyInfo = {
            thirdPartyLibs,
            uiLibs,
          }
          allDependencies[componentName] = dependencyInfo
          // await fs.writeFile(path.join(OUTPUT_DIR, `${componentName}.json`), JSON.stringify(dependencyInfo, null, 2));
          // dump all components dependency info to dist/compiled-ui/dependencies.json
        } catch (depError: any) {
          console.error(
            `Error generating dependencies for ${fileName}:`,
            depError.message
          )
        }
      } catch (fileReadError) {
        console.error(`Error reading file ${fileName}:`, fileReadError)
      }
    }
    // // write all dependencies to dist/compiled-ui/dependencies.json
    // await fs.writeFile(path.join(OUTPUT_DIR, 'dependencies.json'), JSON.stringify(allDependencies, null, 2));
    // write all dependencies to apps/desktop/electron/server/ext-server/ui-deps.ts
    await fs.writeFile(
      path.join(process.cwd(), "packages", "v3", "ui-deps.ts"),
      `// This file is auto-generated by scripts/compile-ui-files.ts on ${new Date().toISOString()}
// DO NOT EDIT THIS FILE MANUALLY
export const uiComponentsDependencies = ${JSON.stringify(allDependencies, null, 2)}`
    )
    console.log("\nCompilation process finished.")
  } catch (error) {
    console.error("Error during script execution:", error)
  }
}

main().catch((error) => {
  console.error("Unhandled error in main:", error)
  process.exit(1)
})
