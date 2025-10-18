import { resolveLocalFileDependencies, type FileResolver } from './get-deps-file';

describe('resolveLocalFileDependencies', () => {
  // Mock file system
  const mockFiles: Record<string, string> = {
    'main.ts': `
      import { helper } from './utils/helper';
      import { Component } from './components/Component';
      import './styles.css';
      
      export function main() {
        return helper() + Component();
      }
    `,
    'utils/helper.ts': `
      import { config } from '../config';
      
      export function helper() {
        return config.value;
      }
    `,
    'components/Component.tsx': `
      import React from 'react';
      import { helper } from '../utils/helper';
      
      export function Component() {
        return <div>{helper()}</div>;
      }
    `,
    'config.ts': `
      export const config = {
        value: 'Hello World'
      };
    `,
    'styles.css': `
      .main { color: blue; }
    `
  };

  const mockFileResolver: FileResolver = async (fileId: string) => {
    const content = mockFiles[fileId];
    if (!content) return null;

    // Determine extension based on file extension
    const ext = fileId.endsWith('.tsx') ? 'tsx' : 'ts';
    return { ext, content };
  };

  it('should resolve all local file dependencies', async () => {
    const result = await resolveLocalFileDependencies(
      'main.ts',
      mockFiles['main.ts'],
      'ts',
      mockFileResolver
    );

    // Should include main file and all its dependencies
    const fileIds = result.map(f => f.id).sort();
    expect(fileIds).toEqual([
      'components/Component.tsx',
      'config.ts',
      'main.ts',
      'styles.css',
      'utils/helper.ts'
    ]);
  });

  it('should handle circular dependencies', async () => {
    const circularFiles: Record<string, string> = {
      'a.ts': `import { b } from './b';`,
      'b.ts': `import { a } from './a';`
    };

    const circularResolver: FileResolver = async (fileId: string) => {
      const content = circularFiles[fileId];
      if (!content) return null;

      const ext = fileId.endsWith('.tsx') ? 'tsx' : 'ts';
      return { ext, content };
    };

    const result = await resolveLocalFileDependencies(
      'a.ts',
      circularFiles['a.ts'],
      'ts',
      circularResolver
    );

    expect(result).toHaveLength(2);
    expect(result.map(f => f.id).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('should handle missing files gracefully', async () => {
    const codeWithMissingImport = `
      import { existing } from './existing';
      import { missing } from './missing';
    `;

    const partialFiles: Record<string, string> = {
      'main.ts': codeWithMissingImport,
      'existing.ts': 'export const existing = true;'
    };

    const partialResolver: FileResolver = async (fileId: string) => {
      const content = partialFiles[fileId];
      if (!content) return null;

      const ext = fileId.endsWith('.tsx') ? 'tsx' : 'ts';
      return { ext, content };
    };

    const result = await resolveLocalFileDependencies(
      'main.ts',
      codeWithMissingImport,
      'ts',
      partialResolver
    );

    // Should include main and existing, but not crash on missing
    expect(result).toHaveLength(2);
    expect(result.map(f => f.id).sort()).toEqual(['existing.ts', 'main.ts']);
  });

  it('should handle dynamic imports', async () => {
    const dynamicImportCode = `
      const module = await import('./dynamic');
      import('./another-dynamic').then(m => console.log(m));
    `;

    const dynamicFiles: Record<string, string> = {
      'main.ts': dynamicImportCode,
      'dynamic.ts': 'export const dynamic = true;',
      'another-dynamic.ts': 'export const anotherDynamic = true;'
    };

    const dynamicResolver: FileResolver = async (fileId: string) => {
      const content = dynamicFiles[fileId];
      if (!content) return null;

      const ext = fileId.endsWith('.tsx') ? 'tsx' : 'ts';
      return { ext, content };
    };

    const result = await resolveLocalFileDependencies(
      'main.ts',
      dynamicImportCode,
      'ts',
      dynamicResolver
    );

    expect(result).toHaveLength(3);
    expect(result.map(f => f.id).sort()).toEqual([
      'another-dynamic.ts',
      'dynamic.ts',
      'main.ts'
    ]);
  });

  it('should normalize import paths correctly', async () => {
    const indexFiles: Record<string, string> = {
      'main.ts': `import { utils } from './utils';`,
      'utils/index.ts': `export const utils = true;`
    };

    const indexResolver: FileResolver = async (fileId: string) => {
      const content = indexFiles[fileId];
      if (!content) return null;

      const ext = fileId.endsWith('.tsx') ? 'tsx' : 'ts';
      return { ext, content };
    };

    const result = await resolveLocalFileDependencies(
      'main.ts',
      indexFiles['main.ts'],
      'ts',
      indexResolver
    );

    expect(result).toHaveLength(2);
    expect(result.map(f => f.id).sort()).toEqual(['main.ts', 'utils/index.ts']);
  });

  it('should handle empty file content', async () => {
    const result = await resolveLocalFileDependencies(
      'empty.ts',
      '',
      'ts',
      mockFileResolver
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('empty.ts');
    expect(result[0].imports).toEqual([]);
  });

  it('should preserve import information in resolved files', async () => {
    const result = await resolveLocalFileDependencies(
      'main.ts',
      mockFiles['main.ts'],
      'ts',
      mockFileResolver
    );

    const mainFile = result.find(f => f.id === 'main.ts');
    expect(mainFile?.imports).toEqual([
      './utils/helper',
      './components/Component',
      './styles.css'
    ]);

    const helperFile = result.find(f => f.id === 'utils/helper.ts');
    expect(helperFile?.imports).toEqual(['../config']);
  });
});
