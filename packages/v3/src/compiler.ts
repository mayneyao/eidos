import * as oxc from "oxc-transform";

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
  const { uiLibCode = "" } = options;

  try {
    // Remove CSS imports
    const sanitizedSourceCode = sourceCode.replace(/import\s+(['"])[^'"]*?\.css\1;?\n?/g, '');

    // Combine uiLibCode with source code
    const sourceWithLibs = uiLibCode ? `${uiLibCode}\n${sanitizedSourceCode}` : sanitizedSourceCode;

    console.log('sourceWithLibs', sourceWithLibs);

    // Use oxc-transform with automatic JSX runtime
    const result = oxc.transform(
      'source.tsx',
      sourceWithLibs,
      {
        typescript: {}
      }
    );

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((err: any) => err.message || err.toString()).join('\n');
      return { code: "", error: errorMessages };
    }

    console.log('result.code', result.code);

    return {
      code: result.code,
      error: null,
    };
  } catch (err: any) {
    return { code: "", error: err.message };
  }
};
