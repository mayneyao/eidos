import { compileCode } from './compiler';

describe('compiler', () => {
  describe('compileCode', () => {
    it('should compile basic JSX without React import', async () => {
      const input = `
        function Component() {
          return <div>Hello World</div>;
        }
      `;

      const result = await compileCode(input);

      expect(result.error).toBeNull();
      expect(result.code).toContain('jsx');
      expect(result.code).toContain('react/jsx-runtime');
    });

    it('should compile TypeScript JSX', async () => {
      const input = `
        interface Props {
          message: string;
        }
        
        function Component({ message }: Props) {
          return <div>{message}</div>;
        }
      `;

      const result = await compileCode(input);

      expect(result.error).toBeNull();
      expect(result.code).toBeTruthy();
    });

    it('should remove CSS imports', async () => {
      const input = `
        import './styles.css';
        import "global.css";
        
        function Component() {
          return <div>Hello</div>;
        }
      `;

      const result = await compileCode(input);

      expect(result.error).toBeNull();
      expect(result.code).not.toContain('styles.css');
      expect(result.code).not.toContain('global.css');
    });

    it('should include uiLibCode when provided', async () => {
      const input = `
        function Component() {
          return <Button>Click me</Button>;
        }
      `;

      const uiLibCode = `
        const Button = ({ children }) => <button>{children}</button>;
      `;

      const result = await compileCode(input, { uiLibCode });

      expect(result.error).toBeNull();
      expect(result.code).toContain('Button');
    });

    it('should handle complex JSX with props', async () => {
      const input = `
        function App() {
          const items = ['a', 'b', 'c'];
          return (
            <div className="container">
              <h1 style={{ color: 'red' }}>Title</h1>
              {items.map(item => (
                <span key={item}>{item}</span>
              ))}
            </div>
          );
        }
      `;

      const result = await compileCode(input);

      expect(result.error).toBeNull();
      expect(result.code).toBeTruthy();
    });

    it('should handle TypeScript types and interfaces', async () => {
      const input = `
        type Color = 'red' | 'blue' | 'green';
        
        interface ButtonProps {
          color: Color;
          onClick: () => void;
        }
        
        const Button: React.FC<ButtonProps> = ({ color, onClick }) => {
          return <button style={{ color }} onClick={onClick}>Click</button>;
        };
      `;

      const result = await compileCode(input);

      expect(result.error).toBeNull();
      expect(result.code).toBeTruthy();
    });

    it('should handle React hooks', async () => {
      const input = `
        import { useState, useEffect } from 'react';
        
        function Counter() {
          const [count, setCount] = useState(0);
          
          useEffect(() => {
            document.title = \`Count: \${count}\`;
          }, [count]);
          
          return (
            <button onClick={() => setCount(count + 1)}>
              Count: {count}
            </button>
          );
        }
      `;

      const result = await compileCode(input);

      expect(result.error).toBeNull();
      expect(result.code).toContain('useState');
      expect(result.code).toContain('useEffect');
    });

    it('should return error for invalid syntax', async () => {
      const input = `
        function Component() {
          return <div>unclosed div
        }
      `;

      const result = await compileCode(input);

      expect(result.error).not.toBeNull();
      expect(result.code).toBe('');
    });

    it('should handle empty input', async () => {
      const result = await compileCode('');

      expect(result.error).toBeNull();
      expect(result.code).toBeTruthy();
    });

    it('should handle regular JavaScript without JSX', async () => {
      const input = `
        function add(a, b) {
          return a + b;
        }
        
        const result = add(2, 3);
        console.log(result);
      `;

      const result = await compileCode(input);

      expect(result.error).toBeNull();
      expect(result.code).toContain('add');
      expect(result.code).toContain('console.log');
    });

    it('should handle JSX fragments', async () => {
      const input = `
        function Component() {
          return (
            <>
              <div>First</div>
              <div>Second</div>
            </>
          );
        }
      `;

      const result = await compileCode(input);

      expect(result.error).toBeNull();
      expect(result.code).toBeTruthy();
    });
  });
}); 