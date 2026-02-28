import type { Plugin } from "vite"

export const createHtmlPlugin = (src: string): Plugin => {
  return {
    name: "html-transform",
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler() {
        return [
          {
            tag: "script",
            attrs: { type: "module", src },
            injectTo: "body",
          },
        ]
      },
    },
  }
}
