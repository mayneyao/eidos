declare module "marked" {
  export interface MarkedOptions {
    gfm?: boolean
    headerIds?: boolean
    mangle?: boolean
    renderer?: Renderer
  }

  export class Renderer {
    html: (html: string) => string
    link: (href: string | null, title: string | null, text: string) => string
    image: (href: string | null, title: string | null, text: string) => string
  }

  export const marked: {
    parse(markdown: string, options?: MarkedOptions): string
  }
}
