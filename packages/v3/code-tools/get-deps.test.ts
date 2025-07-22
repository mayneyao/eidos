import { getImportsFromCode, getExtLibs } from './get-deps';

describe('getImportsFromCode', () => {
  it('should extract module names from standard import statements', () => {
    const code = `
      import React from 'react';
      import { useState, useEffect } from 'react';
      import * as NextAuth from 'next-auth';
      import fs from "fs";
      import path from 'node:path';
    `;
    const expectedImports = ['react', 'next-auth', 'fs', 'node:path'];
    expect(getImportsFromCode(code).sort()).toEqual(expectedImports.sort());
  });

  it('should extract module names from side-effect import statements', () => {
    const code = `
      import './styles.css';
      import "xterm/css/xterm.css";
      import "another-module/dist/main.css";
    `;
    const expectedImports = ['./styles.css', 'xterm/css/xterm.css', 'another-module/dist/main.css'];
    expect(getImportsFromCode(code).sort()).toEqual(expectedImports.sort());
  });

  it('should extract module names from mixed import statements', () => {
    const code = `
      import React from 'react';
      import './app-init.js';
      import { Button } from '@/components/ui/button';
      import "xterm/css/xterm.css";
      import "globals";
    `;
    const expectedImports = ['react', './app-init.js', '@/components/ui/button', 'xterm/css/xterm.css', 'globals'];
    expect(getImportsFromCode(code).sort()).toEqual(expectedImports.sort());
  });

  it('should handle code with no import statements', () => {
    const code = `
      const x = 10;
      function greet() { console.log("Hello"); }
    `;
    expect(getImportsFromCode(code)).toEqual([]);
  });

  it('should handle empty string input', () => {
    expect(getImportsFromCode('')).toEqual([]);
  });

  it('should correctly parse imports with different quoting styles', () => {
    const code = `
      import a from "module-a";
      import b from 'module-b';
      import "module-c";
      import 'module-d';
    `;
    const expectedImports = ['module-a', 'module-b', 'module-c', 'module-d'];
    expect(getImportsFromCode(code).sort()).toEqual(expectedImports.sort());
  });

  it('should handle imports with unusual spacing', () => {
    const code = `
      import    React   from "react"   ;
      import      './styles.css'  ;
      import {नाम} from    "नाम";
    `;
    const expectedImports = ['react', './styles.css', 'नाम'];
    expect(getImportsFromCode(code).sort()).toEqual(expectedImports.sort());
  });

  it('should not confuse import-like keywords in comments or strings', () => {
    const code = `
      // import fake from "fake-module-in-comment";
      const greeting = 'import "hello"';
      /*
       * import anotherFake from "another-fake-module";
       */
      import real from "real-module";
      import "real-side-effect.css";
    `;
    const expectedImports = ['real-module', 'real-side-effect.css'];
    expect(getImportsFromCode(code).sort()).toEqual(expectedImports.sort());
  });

  it('should extract module names from dynamic import statements', () => {
    const code = `
      const moduleA = await import('module-a');
      function loadModuleB() {
        import("module-b").then(m => console.log(m));
      }
      const moduleC = import ( 'module-c' )
    `;
    const expectedImports = ['module-a', 'module-b', 'module-c'];
    expect(getImportsFromCode(code).sort()).toEqual(expectedImports.sort());
  });


  it('should handle a mix of all import and export types', () => {
    const code = `
      import React from 'react';
      import('dynamic-dep');
      export { MyComponent } from './components';
      // This is a comment and should be ignored: import('fake-dynamic');
      const x = "import('string-literal-import')";
    `;
    const expectedImports = ['react', 'dynamic-dep'];
    expect(getImportsFromCode(code).sort()).toEqual(expectedImports.sort());
  });

  it('should ignore dynamic imports of network URLs', () => {
    const code = `
      import('https://example.com/module.js');
      import('http://example.com/another.js');
      import local from './local.js';
    `;
    const expectedImports = ['./local.js'];
    expect(getImportsFromCode(code).sort()).toEqual(expectedImports.sort());
  });
});

describe('getExtLibs', () => {
  it('should extract only external libraries, excluding local and path-mapped packages', () => {
    const code = `
      import React from 'react';
      import { useState } from 'react';
      import lodash from 'lodash';
      import './local-file.js';
      import '../parent-file.js';
      import { Button } from '@/components/ui/button';
      import { utils } from '@/lib/utils';
      import 'external-css-lib/dist/styles.css';
      import './styles.css';
      import axios from 'axios';
    `;
    const expectedExtLibs = ['react', 'lodash', 'axios'];
    expect(getExtLibs(code).sort()).toEqual(expectedExtLibs.sort());
  });

  it('should return empty array when no external libraries are found', () => {
    const code = `
      import './local.js';
      import '../parent.js';
      import { Component } from '@/components/Component';
      import '@/styles/global.css';
      import './styles.css';
    `;
    expect(getExtLibs(code)).toEqual([]);
  });

  it('should handle scoped packages as external libraries', () => {
    const code = `
      import { Component } from '@mui/material';
      import { styled } from '@emotion/styled';
      import { Button } from '@/components/ui/button';
      import './local.js';
    `;
    const expectedExtLibs = ['@mui/material', '@emotion/styled'];
    expect(getExtLibs(code).sort()).toEqual(expectedExtLibs.sort());
  });

  it('should handle node built-in modules as external libraries', () => {
    const code = `
      import fs from 'fs';
      import path from 'node:path';
      import { createServer } from 'node:http';
      import './local.js';
      import { utils } from '@/lib/utils';
    `;
    const expectedExtLibs = ['fs', 'node:path', 'node:http'];
    expect(getExtLibs(code).sort()).toEqual(expectedExtLibs.sort());
  });

  it('should handle dynamic imports correctly', () => {
    const code = `
      const react = await import('react');
      import('./local.js');
      import('@/components/Button');
      const lodash = import('lodash');
    `;
    const expectedExtLibs = ['react', 'lodash'];
    expect(getExtLibs(code).sort()).toEqual(expectedExtLibs.sort());
  });

  it('should handle empty code', () => {
    expect(getExtLibs('')).toEqual([]);
  });
});