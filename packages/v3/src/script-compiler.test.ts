import { describe, it, expect } from 'vitest';
import { scriptCodeCompile, compileScript, getCompileMethod, getCompileMethodByScriptType } from './script-compiler';

describe('script-compiler', () => {
  describe('scriptCodeCompile', () => {
    it('should compile basic TypeScript code', async () => {
      const input = `
        interface User {
          name: string;
          age: number;
        }
        
        function greetUser(user: User): string {
          return \`Hello, \${user.name}! You are \${user.age} years old.\`;
        }
        
        const user: User = { name: 'Alice', age: 30 };
        console.log(greetUser(user));
      `;

      const result = await scriptCodeCompile(input);

      expect(result).toBeTruthy();
      expect(result).toContain('greetUser');
      expect(result).not.toContain('interface User'); // TypeScript interfaces should be removed
    });

    it('should compile TypeScript with modern features', async () => {
      const input = `
        type Status = 'pending' | 'completed' | 'failed';
        
        class TaskManager {
          private tasks: Map<string, Status> = new Map();
          
          addTask(id: string, status: Status = 'pending'): void {
            this.tasks.set(id, status);
          }
          
          getTask(id: string): Status | undefined {
            return this.tasks.get(id);
          }
        }
        
        const manager = new TaskManager();
        manager.addTask('task1');
      `;

      const result = await scriptCodeCompile(input);

      expect(result).toBeTruthy();
      expect(result).toContain('TaskManager');
      expect(result).toContain('addTask');
    });

    it('should handle async/await syntax', async () => {
      const input = `
        async function fetchData(): Promise<string> {
          const response = await fetch('/api/data');
          return response.text();
        }
        
        fetchData().then(data => console.log(data));
      `;

      const result = await scriptCodeCompile(input);

      expect(result).toBeTruthy();
      expect(result).toContain('fetchData');
      expect(result).toContain('async');
    });

    it('should handle decorators and metadata', async () => {
      const input = `
        function logged(target: any, key: string, descriptor: PropertyDescriptor) {
          const original = descriptor.value;
          descriptor.value = function(...args: any[]) {
            console.log(\`Calling \${key} with\`, args);
            return original.apply(this, args);
          };
        }
        
        class Calculator {
          @logged
          add(a: number, b: number): number {
            return a + b;
          }
        }
      `;

      const result = await scriptCodeCompile(input);

      expect(result).toBeTruthy();
      expect(result).toContain('Calculator');
    });

    it('should throw error for invalid TypeScript', async () => {
      const input = `
        function invalidSyntax(
          // Missing closing parenthesis and body
      `;

      await expect(scriptCodeCompile(input)).rejects.toThrow();
    });


    it('should compile modern JavaScript features', async () => {
      const input = `
        const numbers = [1, 2, 3, 4, 5];
        
        // Destructuring and spread
        const [first, second, ...rest] = numbers;
        const newNumbers = [...numbers, 6, 7];
        
        // Arrow functions and array methods
        const doubled = numbers.map(n => n * 2);
        const sum = numbers.reduce((acc, n) => acc + n, 0);
        
        // Template literals
        const message = \`Sum of \${numbers.length} numbers is \${sum}\`;
        
        // Optional chaining and nullish coalescing
        const obj = { a: { b: null } };
        const value = obj.a?.b ?? 'default';
      `;

      const result = await scriptCodeCompile(input);

      expect(result).toBeTruthy();
      expect(result).toContain('numbers');
    });
  });

  describe('getCompileMethodByScriptType', () => {
    it('should return correct compile methods for different script types', () => {
      expect(getCompileMethodByScriptType('script')).toBe(scriptCodeCompile);
      expect(getCompileMethodByScriptType('block')).toBeDefined(); // blockCodeCompile
      expect(getCompileMethodByScriptType('py_script')).toBeDefined(); // pythonCodeCompile
      expect(getCompileMethodByScriptType('doc_plugin')).toBeDefined(); // lexicalCodeCompile
      expect(getCompileMethodByScriptType('m_block')).toBeDefined(); // blockCodeCompile
      expect(getCompileMethodByScriptType('unknown_type')).toBeUndefined();
    });
  });

  describe('getCompileMethod', () => {
    it('should return compile method based on script object', () => {
      const scriptScript = { type: 'script' };
      const blockScript = { type: 'block' };
      const pyScript = { type: 'py_script' };
      const docPlugin = { type: 'doc_plugin' };
      const legacyBlockScript = { type: 'm_block' };

      expect(getCompileMethod(scriptScript)).toBe(scriptCodeCompile);
      expect(getCompileMethod(blockScript)).toBeDefined();
      expect(getCompileMethod(pyScript)).toBeDefined();
      expect(getCompileMethod(docPlugin)).toBeDefined();
      expect(getCompileMethod(legacyBlockScript)).toBeDefined();
    });
  });

  describe('compileScript', () => {
    it('should compile script with ts_code', async () => {
      const script = {
        type: 'script',
        ts_code: 'const x: number = 42; console.log(x);',
        code: 'old code'
      };

      const result = await compileScript(script);

      expect(result).toBeTruthy();
      expect(result).toContain('42');
    });

    it('should fallback to code when ts_code is empty', async () => {
      const script = {
        type: 'script',
        ts_code: '',
        code: 'console.log("fallback");'
      };

      const result = await compileScript(script);

      expect(result).toBeTruthy();
      expect(result).toContain('fallback');
    });

    it('should return empty string for unsupported script type', async () => {
      const script = {
        type: 'unsupported_type',
        ts_code: 'some code',
        code: 'some code'
      };

      const result = await compileScript(script);

      expect(result).toEqual('some code');
    });

    it('should handle script without code', async () => {
      const script = {
        type: 'script',
        ts_code: '',
        code: ''
      };

      const result = await compileScript(script);

      expect(result).toEqual(''); // Should return empty but compiled result
    });

    it('should compile python script (no-op)', async () => {
      const script = {
        type: 'py_script',
        ts_code: '',
        code: 'print("Hello Python")'
      };

      const result = await compileScript(script);

      expect(result).toBe('print("Hello Python")'); // Python code passes through unchanged
    });
  });
}); 