/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {
    $getNodeTriplet,
    $isTableCellNode,
    $isTableSelection,
    TableCellNode,
    TableSelection,
} from "@lexical/table"
import {
    $getSelection,
    $isElementNode,
    $isParagraphNode,
    $isRangeSelection,
    $isTextNode,
    type ElementNode,
    type LexicalEditor
} from "lexical"

import "./index.css"

export function computeSelectionCount(selection: TableSelection): {
    columns: number
    rows: number
} {
    const selectionShape = selection.getShape()
    return {
        columns: selectionShape.toX - selectionShape.fromX + 1,
        rows: selectionShape.toY - selectionShape.fromY + 1,
    }
}

export function $canUnmerge(): boolean {
    const selection = $getSelection()
    if (
        ($isRangeSelection(selection) && !selection.isCollapsed()) ||
        ($isTableSelection(selection) && !selection.anchor.is(selection.focus)) ||
        (!$isRangeSelection(selection) && !$isTableSelection(selection))
    ) {
        return false
    }
    const [cell] = $getNodeTriplet(selection.anchor)
    return cell.__colSpan > 1 || cell.__rowSpan > 1
}

export function $cellContainsEmptyParagraph(cell: TableCellNode): boolean {
    if (cell.getChildrenSize() !== 1) {
        return false
    }
    const firstChild = cell.getFirstChildOrThrow()
    if (!$isParagraphNode(firstChild) || !firstChild.isEmpty()) {
        return false
    }
    return true
}

export function $selectLastDescendant(node: ElementNode): void {
    const lastDescendant = node.getLastDescendant()
    if ($isTextNode(lastDescendant)) {
        lastDescendant.select()
    } else if ($isElementNode(lastDescendant)) {
        lastDescendant.selectEnd()
    } else if (lastDescendant !== null) {
        lastDescendant.selectNext()
    }
}

export function currentCellBackgroundColor(
    editor: LexicalEditor
): null | string {
    return editor.getEditorState().read(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection) || $isTableSelection(selection)) {
            const [cell] = $getNodeTriplet(selection.anchor)
            if ($isTableCellNode(cell)) {
                return cell.getBackgroundColor()
            }
        }
        return null
    })
}