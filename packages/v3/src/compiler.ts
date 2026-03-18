import * as oxc from "oxc-transform"

interface CompileOptions {
  uiLibCode?: string
  /** Whether the source is TSX (contains JSX). Defaults to true for backward compatibility. */
  isTsx?: boolean
  /** Optional filename. If provided with .tsx/.ts extension, will be used to determine parsing mode.
   * For example: "my-component.tsx" → JSX mode, "my-script.ts" → pure TypeScript mode
   */
  filename?: string
}

interface CompileResult {
  code: string
  error: string | null
}

export const compileCode = async (
  sourceCode: string,
  options: CompileOptions = {}
): Promise<CompileResult> => {
  const { uiLibCode = "", isTsx = true, filename: userFilename } = options

  try {
    // Remove CSS imports
    const sanitizedSourceCode = sourceCode.replace(
      /import\s+(['"])[^'"]*?\.css\1;?\n?/g,
      ""
    )

    // Combine uiLibCode with source code
    const sourceWithLibs = uiLibCode
      ? `${uiLibCode}\n${sanitizedSourceCode}`
      : sanitizedSourceCode

    console.log("sourceWithLibs", sourceWithLibs)

    // Determine filename: use provided filename, or fallback to isTsx option
    // .tsx extension → JSX mode, .ts extension → pure TypeScript mode
    const filename = userFilename || (isTsx ? "source.tsx" : "source.ts")
    const isTsxFile = filename.endsWith(".tsx")

    // Use oxc-transform with automatic JSX runtime
    // Use lang option to explicitly set parsing mode based on file extension
    const result = oxc.transform(filename, sourceWithLibs, {
      typescript: {},
      lang: isTsxFile ? "tsx" : "ts",
    })

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors
        .map((err: any) => err.message || err.toString())
        .join("\n")
      return { code: "", error: errorMessages }
    }

    console.log("result.code", result.code)

    return {
      code: result.code,
      error: null,
    }
  } catch (err: any) {
    return { code: "", error: err.message }
  }
}
