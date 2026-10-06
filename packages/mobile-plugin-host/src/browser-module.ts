import { loadTypeScript } from "./browser-toolchain"
import type { Node, SourceFile } from "typescript"
/** Package entries are already self-contained JS. No Node/esbuild runtime in a WebView. */
export function browserModule(code: string): string {
  const ts = loadTypeScript()
  return ts.transpileModule(code, {
    fileName: "plugin.js",
    transformers: {
      before: [
        (context) => (source) => {
          const visit = (node: Node): Node =>
            ts.isMetaProperty(node) &&
            node.keywordToken === ts.SyntaxKind.ImportKeyword
              ? ts.factory.createObjectLiteralExpression()
              : ts.visitEachChild(node, visit, context)
          return ts.visitNode(source, visit) as SourceFile
        },
      ],
    },
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      allowJs: true,
    },
  }).outputText
}
