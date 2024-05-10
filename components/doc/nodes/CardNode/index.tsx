import {
    ElementNode,
    LexicalNode,
    SerializedElementNode,
    SerializedLexicalNode
} from "lexical"

export class CardNode extends ElementNode {
  static getType(): string {
    return "card"
  }

  static clone(node: CardNode): CardNode {
    return new CardNode(node.__key)
  }

  exportJSON(): SerializedElementNode<SerializedLexicalNode> {
    return {
      ...super.exportJSON(),
      type: CardNode.getType(),
      version: 1,
    }
  }

  static importJSON(
    json: SerializedElementNode<SerializedLexicalNode>
  ): CardNode {
    return new CardNode()
  }

  createDOM(): HTMLElement {
    // Define the DOM element here
    const dom = document.createElement("div")
    // with border padding 1rem rounded corners background #ccc
    dom.style.border = "1px solid #ccc"
    dom.style.padding = "1rem"
    dom.style.borderRadius = "0.5rem"
    return dom
  }

  updateDOM(prevNode: CardNode, dom: HTMLElement): boolean {
    // Returning false tells Lexical that this node does not need its
    // DOM element replacing with a new copy from createDOM.
    return false
  }

  canInsertTextBefore(): boolean {
    return true
  }
  canInsertTextAfter(): boolean {
    return true
  }
  canIndent(): false {
    return false
  }
}

export function $createCardNode(): CardNode {
  return new CardNode()
}

export function $isCardNode(
  node: LexicalNode | null | undefined
): node is CardNode {
  return node instanceof CardNode
}
