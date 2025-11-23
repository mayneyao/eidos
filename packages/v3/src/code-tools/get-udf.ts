import * as oxc from 'oxc-transform';
import { extractFunction, extractConstant } from './code-extractor';

interface UDFMeta {
    type: "udf";
    funcName: string;
    udf: {
        name: string;
        deterministic: boolean;
    };
}

interface UDFResult {
    meta: UDFMeta;
    jsFunction: string;
    createFunctionConfig: {
        name: string;
        xFunc: Function;
        deterministic?: boolean;
    };
}

/**
 * Extract UDF extension info from TypeScript code and convert to better-sqlite3 format
 * @param code TypeScript source code
 * @returns UDF configuration and JavaScript function
 */
export function extractUDF(code: string): UDFResult | null {
    try {
        const meta = extractConstant(code, 'meta') as UDFMeta;
        if (!meta || meta.type !== 'udf') {
            return null;
        }

        const functionCode = extractFunction(code, meta.funcName);
        if (!functionCode) {
            return null;
        }

        const jsFunction = convertTSFunctionToJS(functionCode);
        const xFunc = new Function(`return (${jsFunction})`)()

        const createFunctionConfig = {
            name: meta.udf.name,
            xFunc: xFunc,
            deterministic: meta.udf.deterministic
        };

        return {
            meta,
            jsFunction,
            createFunctionConfig
        };

    } catch (error) {
        console.error('Error extracting UDF:', error);
        return null;
    }
}

/**
 * Convert TypeScript function to JavaScript and remove function name
 * @param tsFunction TypeScript function code
 * @returns JavaScript function code without function name
 */
function convertTSFunctionToJS(tsFunction: string): string {
    const result = oxc.transform(
        'function.ts',
        tsFunction,
        {
            typescript: {}
        }
    );

    if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map((err: any) => err.message || err.toString()).join('\n');
        throw new Error(`oxc-transform errors: ${errorMessages}`);
    }

    // Remove function name to make it anonymous
    const anonymousFunction = result.code.replace(/function\s+\w+\s*\(/, 'function(');

    return anonymousFunction;
}


/**
 * Validate UDF code format
 * @param code TypeScript source code
 * @returns Validation result
 */
export function validateUDFCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
        const meta = extractConstant(code, 'meta');
        if (!meta) {
            errors.push('Missing meta export');
        } else {
            if (meta.type !== 'udf') {
                errors.push('meta.type must be "udf"');
            }
            if (!meta.funcName) {
                errors.push('meta.funcName is required');
            }
            if (!meta.udf || !meta.udf.name) {
                errors.push('meta.udf.name is required');
            }
            if (typeof meta.udf.deterministic !== 'boolean') {
                errors.push('meta.udf.deterministic must be a boolean');
            }
        }

        if (meta && meta.funcName) {
            const functionCode = extractFunction(code, meta.funcName);
            if (!functionCode) {
                errors.push(`Function ${meta.funcName} not found`);
            }
        }

    } catch (error) {
        errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

export type { UDFMeta, UDFResult };