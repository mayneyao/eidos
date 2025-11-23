import { describe, it, expect } from 'vitest';
import { extractUDF, validateUDFCode } from './get-udf';

describe('extractUDF', () => {
  it('should extract UDF from valid TypeScript code', () => {
    const code = `
export const meta = {
  type: "udf",
  funcName: "myAdd",
  udf: {
    name: "add",
    deterministic: true,
  },
}

function myAdd(a: number, b: number) {
  return a + b
}`;

    const result = extractUDF(code);
    console.log(result)

    expect(result).not.toBeNull();
    expect(result!.meta.type).toBe('udf');
    expect(result!.meta.funcName).toBe('myAdd');
    expect(result!.meta.udf.name).toBe('add');
    expect(result!.meta.udf.deterministic).toBe(true);

    expect(result!.jsFunction).not.toContain(': number');

    expect(result!.createFunctionConfig.name).toBe('add');
    expect(result!.createFunctionConfig.deterministic).toBe(true);
    expect(typeof result!.createFunctionConfig.xFunc).toBe('function');

    const func = result!.createFunctionConfig.xFunc;
    expect(func(2, 3)).toBe(5);
  });

  it('should handle complex function with multiple parameters', () => {
    const code = `
export const meta = {
  type: "udf",
  funcName: "calculateArea",
  udf: {
    name: "area",
    deterministic: true,
  },
}

function calculateArea(width: number, height: number, shape: string) {
  if (shape === 'rectangle') {
    return width * height;
  } else if (shape === 'triangle') {
    return (width * height) / 2;
  }
  return 0;
}`;

    const result = extractUDF(code);

    expect(result).not.toBeNull();
    expect(result!.createFunctionConfig.xFunc(10, 5, 'rectangle')).toBe(50);
    expect(result!.createFunctionConfig.xFunc(10, 5, 'triangle')).toBe(25);
  });

  it('should return null for invalid code', () => {
    const code = `
const notAUDF = {
  type: "other",
}`;

    const result = extractUDF(code);
    expect(result).toBeNull();
  });

  it('should return null when function is missing', () => {
    const code = `
export const meta = {
  type: "udf",
  funcName: "missingFunction",
  udf: {
    name: "missing",
    deterministic: true,
  },
}`;

    const result = extractUDF(code);
    expect(result).toBeNull();
  });
});

describe('validateUDFCode', () => {
  it('should validate correct UDF code', () => {
    const code = `
export const meta = {
  type: "udf",
  funcName: "myAdd",
  udf: {
    name: "add",
    deterministic: true,
  },
}

function myAdd(a: number, b: number) {
  return a + b
}`;

    const result = validateUDFCode(code);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect missing meta', () => {
    const code = `
function myAdd(a: number, b: number) {
  return a + b
}`;

    const result = validateUDFCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing meta export');
  });

  it('should detect wrong meta type', () => {
    const code = `
export const meta = {
  type: "other",
  funcName: "myAdd",
}

function myAdd(a: number, b: number) {
  return a + b
}`;

    const result = validateUDFCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('meta.type must be "udf"');
  });

  it('should detect missing function', () => {
    const code = `
export const meta = {
  type: "udf",
  funcName: "missingFunction",
  udf: {
    name: "missing",
    deterministic: true,
  },
}`;

    const result = validateUDFCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Function missingFunction not found');
  });

  it('should detect missing required fields', () => {
    const code = `
export const meta = {
  type: "udf",
}

function myAdd(a: number, b: number) {
  return a + b
}`;

    const result = validateUDFCode(code);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('meta.funcName is required');
    expect(result.errors).toContain('meta.udf.name is required');
  });
});
