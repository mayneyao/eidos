import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin"

import { ITreeNode } from "@/lib/store/ITreeNode"

export class MentionTypeaheadOption extends MenuOption {
  name: string
  id: string
  rawData: ITreeNode

  constructor(name: string, id: string, rawData: ITreeNode) {
    super(name)
    this.name = name
    this.id = id
    this.rawData = rawData
  }
}
