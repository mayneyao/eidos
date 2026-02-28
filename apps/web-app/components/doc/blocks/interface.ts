import type { Transformer } from "@lexical/markdown"
import type { LexicalCommand } from "lexical"
import type { FunctionComponent } from "react"

export interface DocBlock {
  name: string
  icon: string
  node: any
  plugin: FunctionComponent
  onSelect: (editor: any) => void
  keywords: string[]
  transform?: Transformer
  command: {
    create: LexicalCommand<any>
  }
  createNode: (args: any) => any
  markdownLanguage?: string
  hiddenInMenu?: boolean
}
