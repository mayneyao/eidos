import {
    LexicalEditor,
    LexicalNode
} from "lexical";
import { $createListNode, $isListItemNode, ListItemNode, ListNode, ListType } from "@lexical/list";



export function $moveNode(
    draggedNode: LexicalNode,
    targetNode: LexicalNode,
    shouldInsertAfter: boolean,
    editor: LexicalEditor,
    event?: MouseEvent
) {


    // Handle node type conversions
    let toBeMovedNode: LexicalNode = draggedNode;

    // Convert to list if needed
    if (targetNode.__type !== "listitem" && draggedNode.__type === "listitem") {
        const parentList = draggedNode.getParent() as ListNode;
        const listType: ListType = parentList?.__type === "list" ?
            parentList.getListType() : "bullet";

        const listNode = $createListNode(listType);
        listNode.append(draggedNode);
        toBeMovedNode = listNode;
    }

    // Convert to list item if needed
    // if (draggedNode.__type !== "listitem" && targetNode.__type === "listitem") {
    //     const listItemNode = $createListItemNode()
    //     listItemNode.append(draggedNode)
    //     toBeMovedNode = listItemNode
    // }
    // Handle list item indentation case
    if ((targetNode.__type === "list" || targetNode.__type === "listitem")) {

        if ($isListItemNode(targetNode) && event) {
            const targetElement = editor.getElementByKey(targetNode.getKey());
            if (targetElement) {
                const { left, top, height } = targetElement.getBoundingClientRect();
                const bulletWidth = 20;
                const isFirstItem = targetElement.getAttribute('value') === '1';

                // Check if we should indent the list item
                if ((!isFirstItem || event.clientY - top > height / 2) &&
                    (event.clientX - left) > bulletWidth) {

                    if (toBeMovedNode.__type === "listitem") {
                        // Insert and indent the dragged node
                        shouldInsertAfter ?
                            targetNode.insertAfter(toBeMovedNode) :
                            targetNode.insertBefore(toBeMovedNode);
                        (toBeMovedNode as ListItemNode).setIndent((toBeMovedNode as ListItemNode).getIndent() + 1);
                    } else {
                        if (shouldInsertAfter) {
                            const _targetNode = targetNode.getLastChild();
                            if (_targetNode) {
                                _targetNode.insertAfter(toBeMovedNode);
                            }
                        } else {
                            const _targetNode = (targetNode.getPreviousSibling() as ListItemNode)?.getLastChild();
                            if (_targetNode) {
                                _targetNode.insertAfter(toBeMovedNode);
                            }
                        }
                    }
                    return;
                }
            }
        }
    }

    // Perform the insertion
    shouldInsertAfter ?
        targetNode.insertAfter(toBeMovedNode) :
        targetNode.insertBefore(toBeMovedNode);
}
