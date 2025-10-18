import { describe, it, expect } from 'vitest';
import { extractFunction, extractConstant } from './code-extractor';

describe('extractFunction', () => {
    it('should extract a named function', () => {
        const code = `
function myFunction() {
    return "hello";
}`;
        const expected = `function myFunction() {
    return "hello";
}`;
        expect(extractFunction(code, 'myFunction')).toBe(expected);
    });

    it('should extract an async function', () => {
        const code = `
async function myAsyncFunction() {
    return Promise.resolve("hello");
}`;
        const expected = `async function myAsyncFunction() {
    return Promise.resolve("hello");
}`;
        expect(extractFunction(code, 'myAsyncFunction')).toBe(expected);
    });

    it('should extract an exported named function', () => {
        const code = `
export function myExportedFunction() {
    return "exported";
}`;
        const expected = `function myExportedFunction() {
    return "exported";
}`;
        expect(extractFunction(code, 'myExportedFunction')).toBe(expected);
    });

    it('should extract an exported async function', () => {
        const code = `
export async function myExportedAsyncFunction() {
    return Promise.resolve("exported async");
}`;
        const expected = `async function myExportedAsyncFunction() {
    return Promise.resolve("exported async");
}`;
        expect(extractFunction(code, 'myExportedAsyncFunction')).toBe(expected);
    });

    it('should return null if the function is not found', () => {
        const code = `
function anotherFunction() {
    return "world";
}`;
        expect(extractFunction(code, 'nonExistentFunction')).toBe(null);
    });

    it('should handle complex code with multiple functions', () => {
        const code = `
import React from 'react';

function helper() {
    return "I am a helper";
}

export async function getServerSideProps(context) {
  const data = await fetch('some-api');
  return { props: { data } };
}

const MyComponent = () => <div>Hello</div>;

export default MyComponent;
`;
        const expected = `async function getServerSideProps(context) {
  const data = await fetch('some-api');
  return { props: { data } };
}`;
        expect(extractFunction(code, 'getServerSideProps')).toBe(expected.trim());
    });

    it('should not extract a function call', () => {
        const code = `
myFunction();

function anotherFunction() {
    return "world";
}
`;
        expect(extractFunction(code, 'myFunction')).toBe(null);
    });

    it('should not extract a variable with the same name as the function', () => {
        const code = `
const myFunction = "not a function";

function anotherFunction() {
    return "world";
}
`;
        expect(extractFunction(code, 'myFunction')).toBe(null);
    });

    it('should extract function declaration', () => {
        const code = `
function testFunction() {
    return 'hello';
}
`;
        const result = extractFunction(code, 'testFunction');
        expect(result).toContain('function testFunction() {');
        expect(result).toContain("return 'hello';");
    });

    it('should extract exported function', () => {
        const code = `
export function testFunction() {
    return 'hello';
}
`;
        const result = extractFunction(code, 'testFunction');
        expect(result).toContain('function testFunction() {');
        expect(result).toContain("return 'hello';");
    });

    it('should return null for non-existent function', () => {
        const code = `
function otherFunction() {
    return 'hello';
}
`;
        const result = extractFunction(code, 'testFunction');
        expect(result).toBeNull();
    });
});

describe('extractConstant', () => {
    it('should extract direct export const and return actual value', () => {
        const code = `export const asExtNodeHandler = [{name:'ext name',type:'my_typ'}];`;
        const result = extractConstant(code, 'asExtNodeHandler');
        expect(result).toEqual([{ name: 'ext name', type: 'my_typ' }]);
    });

    it('should extract simple string constant', () => {
        const code = `export const MY_CONSTANT = 'test value';`;
        const result = extractConstant(code, 'MY_CONSTANT');
        expect(result).toBe('test value');
    });

    it('should extract number constant', () => {
        const code = `export const TIMEOUT = 5000;`;
        const result = extractConstant(code, 'TIMEOUT');
        expect(result).toBe(5000);
    });

    it('should extract boolean constant', () => {
        const code = `export const IS_ENABLED = true;`;
        const result = extractConstant(code, 'IS_ENABLED');
        expect(result).toBe(true);
    });

    it('should extract object constant', () => {
        const code = `
export const CONFIG = {
    apiUrl: 'http://localhost:3000',
    timeout: 5000,
    enabled: true
};
`;
        const result = extractConstant(code, 'CONFIG');
        expect(result).toEqual({
            apiUrl: 'http://localhost:3000',
            timeout: 5000,
            enabled: true
        });
    });

    it('should extract array constant', () => {
        const code = `
export const MENU_ITEMS = [
    { id: 1, name: 'Home' },
    { id: 2, name: 'About' }
];
`;
        const result = extractConstant(code, 'MENU_ITEMS');
        expect(result).toEqual([
            { id: 1, name: 'Home' },
            { id: 2, name: 'About' }
        ]);
    });

    it('should extract const from export statement', () => {
        const code = `
const PRIVATE_CONSTANT = 'secret';
export { PRIVATE_CONSTANT };
`;
        const result = extractConstant(code, 'PRIVATE_CONSTANT');
        expect(result).toBe('secret');
    });

    it('should return null for non-exported constants', () => {
        const code = `const PRIVATE_CONSTANT = 'secret';`;
        const result = extractConstant(code, 'PRIVATE_CONSTANT');
        expect(result).toBeNull();
    });

    it('should return null for non-existent constant', () => {
        const code = `export const OTHER_CONSTANT = 'value';`;
        const result = extractConstant(code, 'MY_CONSTANT');
        expect(result).toBeNull();
    });

    it('should handle complex nested structures', () => {
        const code = `
export const asExtNodeHandler =     {
        name: 'ext name',
        type: 'my_typ',
    }
`;
        const result = extractConstant(code, 'asExtNodeHandler');
        expect(result).toEqual({
            name: 'ext name',
            type: 'my_typ',
        });
    });

    it('should extract null constant', () => {
        const code = `export const NULL_VALUE = null;`;
        const result = extractConstant(code, 'NULL_VALUE');
        expect(result).toBeNull();
    });
}); 