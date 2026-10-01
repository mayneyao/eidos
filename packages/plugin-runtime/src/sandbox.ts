import { browserModule } from "./browser-module"
import type { FileMetadata } from "./contracts"
import { bootstrap, type BrowserBinding } from "./browser-bootstrap"
export { SANDBOX_CSP, sandboxCsp } from "./browser-bootstrap"

export function documentViewHtml(code: string, file?: FileMetadata): string {
  return viewHtml(code, { kind: "document", ...(file ? { file } : {}) })
}

export function mediaViewHtml(
  code: string,
  info: {
    path: string
    name: string
    baseName: string
    extension: string
    mimeType: string
    size: number
  }
): string {
  return viewHtml(code, { kind: "media", ...info })
}

export function viewHtml(code: string, binding: BrowserBinding): string {
  // Archive modules are validated self-contained ESM. CommonJS here is only a
  // local exports object inside the iframe closure; no require/Node is supplied.
  const compiled = browserModule(code)
  const script = `(()=>{const module = {exports: {}}; const exports = module.exports;\n${compiled}\n(${bootstrap.toString()})(module.exports.default, ${JSON.stringify(binding)});})()`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html{color-scheme:var(--eidos-color-scheme,light);background:var(--eidos-background,transparent);}
html,body,#app{width:100%;height:100%;margin:0;padding:0;}
*::-webkit-scrollbar{width:15px;height:15px;}
*::-webkit-scrollbar-track,*::-webkit-scrollbar-corner,*::-webkit-resizer{background:transparent;}
*::-webkit-scrollbar-thumb{min-width:2.5rem;min-height:2.5rem;border:3px solid transparent;border-radius:999px;background:var(--eidos-scrollbar-thumb,color-mix(in oklab,var(--eidos-foreground,currentColor) 14%,transparent));background-clip:padding-box;}
*::-webkit-scrollbar-thumb:hover{background-color:var(--eidos-scrollbar-thumb-hover,color-mix(in oklab,var(--eidos-foreground,currentColor) 24%,transparent));}
*::-webkit-scrollbar-thumb:active{background-color:var(--eidos-scrollbar-thumb-active,color-mix(in oklab,var(--eidos-foreground,currentColor) 34%,transparent));}
*::-webkit-scrollbar-button{display:none;width:0;height:0;}
</style></head><body><div id="app"></div><script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
}
