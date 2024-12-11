import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import { $getSelection, $isRangeSelection, $createParagraphNode } from "lexical"
import { getSelectedNode } from "../utils/getSelectedNode"
import { $isListItemNode } from "@lexical/list"
import { $insertNodeToNearestRoot } from "@lexical/utils"

export const $insertDecoratorBlockNode = (node: DecoratorBlockNode) => {
    const selection = $getSelection()

    if ($isRangeSelection(selection)) {
        const selectedNode = getSelectedNode(selection)
        if ($isListItemNode(selectedNode)) {
            selectedNode.append(node)
        } else {
            selection.insertNodes([node])
            if (!node.getNextSibling()) {
                selection.insertNodes([$createParagraphNode()])
            }
        }
    } else {
        $insertNodeToNearestRoot(node)
        if (!node.getNextSibling()) {
            $insertNodeToNearestRoot($createParagraphNode())
        }
    }
}