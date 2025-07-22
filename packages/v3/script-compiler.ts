import type { IExtension } from "@/packages/core/meta-table/extension";
import { compileCode } from "./compiler";
import { compileLexicalCode } from "./lexical-compiler";
import * as oxc from "oxc-transform";

/**
 * Transform relative import paths to add .js extensions for ESM compatibility
 * @param code - Source code to transform
 * @returns Transformed code with .js extensions added to relative imports
 */
function addJsExtensionsToRelativeImports(code: string): string {
    // Transform import statements: import ... from './path' => import ... from './path.js'
    // This regex matches import statements with relative paths (starting with ./ or ../)
    // and adds .js extension if no extension is present
    return code.replace(
        /import\s+(?:[^'"]*\s+from\s+)?['"](\.[^'"]*?)['"](?=\s*;?)/g,
        (match, importPath) => {
            // Check if the import path already has an extension
            if (/\.[a-zA-Z0-9]+$/.test(importPath)) {
                return match; // Already has extension, don't modify
            }
            // Add .js extension for ESM compatibility
            return match.replace(importPath, importPath + '.js');
        }
    );
}

export const scriptCodeCompile = async (
    sourceCode: string
): Promise<string> => {
    try {
        const result = oxc.transform(
            'source.ts',
            sourceCode,
            {
                typescript: {
                    // Use oxc's built-in rewriteImportExtensions to handle TypeScript extensions
                    // This will rewrite .ts/.tsx extensions to .js/.jsx
                    rewriteImportExtensions: 'rewrite'
                }
            }
        );

        if (result.errors && result.errors.length > 0) {
            const errorMessages = result.errors.map((err: any) => err.message || err.toString()).join('\n');
            throw new Error(errorMessages);
        }

        // Additionally transform relative imports without extensions to add .js
        // This is needed because oxc's rewriteImportExtensions only handles existing extensions
        const transformedCode = addJsExtensionsToRelativeImports(result.code);

        return transformedCode;
    } catch (err: any) {
        throw new Error(err.message)
    }
};

export async function blockCodeCompile(ts_code: string): Promise<string> {
    const result = await compileCode(ts_code);
    if (result.error) {
        console.error("Error compiling block code:", result.error);
        throw new Error(result.error);
    }
    return result.code;
}

async function pythonCodeCompile(code: string): Promise<string> {
    // Assuming python code does not need compilation in this context
    return code;
}

async function lexicalCodeCompile(ts_code: string): Promise<string> {
    const result = await compileLexicalCode(ts_code);
    if (result.error) {
        console.error("Error compiling lexical code:", result.error);
        throw new Error(result.error);
    }
    return result.code;
}

export async function compileScript(
    script: { type: string, ts_code: string, code: string }
): Promise<string> {
    const ts_code = script.ts_code;
    const code = script.code;

    const compileMethod = getCompileMethod(script)
    if (!compileMethod) {
        return code || ""
    }
    return compileMethod(ts_code || code || "")
}

export function getCompileMethod(script: { type: string }) {
    return getCompileMethodByScriptType(script.type)
}

export function getCompileMethodByScriptType(scriptType: "script" | "block" | string) {
    // New architecture types
    if (scriptType === "script") {
        return scriptCodeCompile;
    }
    if (scriptType === "block") {
        return blockCodeCompile;
    }
}