import { describe, it, expect } from 'vitest';
import { applyCodePatch, createCodePatch } from './diff';

describe('diff utils', () => {
  describe('createCodePatch', () => {
    it('should create a valid patch for simple text changes', () => {
      const originalCode = 'function hello() {\n  console.log("hello");\n}';
      const newCode = 'function hello() {\n  console.log("hello world");\n}';
      
      const patch = createCodePatch(originalCode, newCode);
      
      expect(patch).toContain('-  console.log("hello");');
      expect(patch).toContain('+  console.log("hello world");');
    });

    it('should create a valid patch for multiple line changes', () => {
      const originalCode = `function sum(a, b) {
  return a + b;
}`;
      const newCode = `function sum(a, b) {
  // Add two numbers
  const result = a + b;
  return result;
}`;
      
      const patch = createCodePatch(originalCode, newCode);
      
      expect(patch).toContain('+  // Add two numbers');
      expect(patch).toContain('+  const result = a + b;');
      expect(patch).toContain('-  return a + b;');
      expect(patch).toContain('+  return result;');
    });

    it('should handle empty strings', () => {
      const patch = createCodePatch('', '');
      expect(patch).toBeTruthy();
    });
  });

  describe('applyCodePatch', () => {
    it('should apply patch and return the expected new code', () => {
      const originalCode = 'function hello() {\n  console.log("hello");\n}';
      const newCode = 'function hello() {\n  console.log("hello world");\n}';
      
      const patch = createCodePatch(originalCode, newCode);
      const result = applyCodePatch(originalCode, patch);
      
      expect(result).toBe(newCode);
    });

    it('should apply patch with multiple line changes', () => {
      const originalCode = `function sum(a, b) {
  return a + b;
}`;
      const newCode = `function sum(a, b) {
  // Add two numbers
  const result = a + b;
  return result;
}`;
      
      const patch = createCodePatch(originalCode, newCode);
      const result = applyCodePatch(originalCode, patch);
      
      expect(result).toBe(newCode);
    });

    it('should throw error for invalid patch string', () => {
      const originalCode = 'function test() {}';
      
      expect(() => {
        applyCodePatch(originalCode, 'invalid patch');
      }).toThrow('Error applying patch');
    });

    it('should throw error when patch cannot be applied', () => {
      const originalCode = 'function hello() {\n  console.log("hello");\n}';
      const newCode = 'function hello() {\n  console.log("hello world");\n}';
      const modifiedOriginal = 'function hello() {\n  console.log("hi");\n}';
      
      const patch = createCodePatch(originalCode, newCode);
      
      expect(() => {
        applyCodePatch(modifiedOriginal, patch);
      }).toThrow('Failed to apply patch');
    });

    it('should handle empty strings', () => {
      const patch = createCodePatch('', 'new content');
      const result = applyCodePatch('', patch);
      expect(result).toBe('new content');
    });
  });
}); 