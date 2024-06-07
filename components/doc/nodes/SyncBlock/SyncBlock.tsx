import { ReactNode } from "react";
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents";
import { DecoratorNode, EditorConfig, LexicalEditor, NodeKey } from "lexical";
import { nodeInfoMap } from "@/components/ai-chat/ai-input-editor";
import { SyncBlockComponent, $createSyncBlock } from "./SyncBlockComponent";


export class SyncBlock extends DecoratorNode<ReactNode> {
  __id: string;

  static getType(): string {
    return "sync-block";
  }

  static clone(node: SyncBlock): SyncBlock {
    return new SyncBlock(node.__id, node.__key);
  }

  constructor(id: string, key?: NodeKey) {
    super(key);
    this.__id = id;
  }

  getTextContent(): string {
    const title = nodeInfoMap.get(this.__id)?.name ?? "Untitled";
    return `<span data-node-id="${this.__id}">${title}</span>`;
  }

  createDOM(): HTMLElement {
    const node = document.createElement("span");
    // node.style.display = "inline-block"
    return node;
  }

  updateDOM(): false {
    return false;
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode {
    const nodeKey = this.getKey();
    const embedBlockTheme = config.theme.embedBlock || {};

    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    };
    return (
      <BlockWithAlignableContents className={className} nodeKey={nodeKey}>
        <SyncBlockComponent id={this.__id} />
      </BlockWithAlignableContents>
    );
  }

  static importJSON(data: any): SyncBlock {
    const node = $createSyncBlock(data.id);
    return node;
  }

  exportJSON() {
    return {
      id: this.__id,
      type: "sync-block",
      version: 1,
    };
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}
