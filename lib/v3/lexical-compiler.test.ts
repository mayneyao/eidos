import { describe, it, expect, beforeAll } from 'vitest';
import { compileLexicalCode } from './lexical-compiler';

describe('lexical-compiler', () => {
    beforeAll(async () => {
        await compileLexicalCode('');
    });

    describe('compileLexicalCode', () => {
        it('should transform named imports from lexical packages', async () => {
            const input = `
        import { $createParagraphNode, $getRoot } from 'lexical';
        import { $isAtNodeEnd } from '@lexical/utils';
      `;

            const result = await compileLexicalCode(input);
            expect(result.error).toBeNull();
            expect(result.code).toContain('const { $createParagraphNode, $getRoot } = window["__LEXICAL"]');
            expect(result.code).toContain('const { $isAtNodeEnd } = window["__@LEXICAL/UTILS"]');
        });

        it('should transform default imports from lexical packages', async () => {
            const input = `
        import MarkdownPlugin from '@lexical/markdown';
        import ComposerContext from '@lexical/react/LexicalComposerContext';
      `;

            const result = await compileLexicalCode(input);

            expect(result.error).toBeNull();
            expect(result.code).toContain('const MarkdownPlugin = window["__@LEXICAL/MARKDOWN"]');
            expect(result.code).toContain('const ComposerContext = window["__@LEXICAL/REACT/LEXICALCOMPOSERCONTEXT"]');
        });

        it('should handle mixed import types', async () => {
            const input = `
        import DefaultExport, { namedExport } from 'lexical';
        import { util1, util2 } from '@lexical/utils';
      `;

            const result = await compileLexicalCode(input);

            expect(result.error).toBeNull();
            expect(result.code).toContain('const DefaultExport = window["__LEXICAL"]');
            expect(result.code).toContain('const { namedExport } = window["__LEXICAL"]');
            expect(result.code).toContain('const { util1, util2 } = window["__@LEXICAL/UTILS"]');
        });

        it('should handle multiple imports from the same package', async () => {
            const input = `
        import { $createParagraphNode } from 'lexical';
        import { $getRoot } from 'lexical';
      `;

            const result = await compileLexicalCode(input);

            expect(result.error).toBeNull();
            expect(result.code).toContain('const { $createParagraphNode } = window["__LEXICAL"]');
            expect(result.code).toContain('const { $getRoot } = window["__LEXICAL"]');
        });

        it('should return error for invalid code', async () => {
            const input = `
        import { from 'lexical';  // 语法错误
      `;

            const result = await compileLexicalCode(input);

            expect(result.error).not.toBeNull();
            expect(result.code).toBe('');
        });

        it('should not transform imports from non-lexical packages', async () => {
            const input = `
        import { useState } from 'react';
        import { $createParagraphNode } from 'lexical';
      `;

            const result = await compileLexicalCode(input);

            expect(result.error).toBeNull();
            expect(result.code).toContain('const { useState } = window["__REACT"]');
            expect(result.code).toContain('const { $createParagraphNode } = window["__LEXICAL"]');
        });

        it('should preserve forward slashes in package imports', async () => {
            const input = `
        import { ComposerContext } from '@lexical/react/LexicalComposerContext';
        import { MarkdownShortcutPlugin } from '@lexical/react/plugins/MarkdownShortcutPlugin';
      `;

            const result = await compileLexicalCode(input);

            expect(result.error).toBeNull();
            expect(result.code).toContain('const { ComposerContext } = window["__@LEXICAL/REACT/LEXICALCOMPOSERCONTEXT"]');
            expect(result.code).toContain('const { MarkdownShortcutPlugin } = window["__@LEXICAL/REACT/PLUGINS/MARKDOWNSHORTCUTPLUGIN"]');
        });
    });
}); 