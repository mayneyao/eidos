import { CodeNode } from "@lexical/code"
import { $nodesOfType, EditorState, Klass, LexicalNode, NodeMap } from "lexical"

import { ExtBlock } from "../hooks/use-ext-blocks"
import { ImageNode } from "../blocks/image/node";
import invariant from "./invariant";

/**
 * some extension blocks want to transform the code with specific language to their own node
 * we cant use $convertFromMarkdownString to transform the code block, cause there are some bugs in lexical
 * https://github.com/facebook/lexical/issues/2564
 * we need to transform the code block manually, after the markdown string is converted to nodes.
 * we can replace the code block with the node created by the extension block
 *
 * if a ext block define `markdownLanguage`, it will be used to match the code block with the same language
 * @param extBlocks
 */
export const $transformExtCodeBlock = (extBlocks: ExtBlock[]) => {
  for (const code of $nodesOfType(CodeNode)) {
    const lang = code.getLanguage()
    if (lang) {
      const extBlock = extBlocks.find(
        (extBlock) => extBlock.markdownLanguage === lang
      )
      if (extBlock) {
        const node = extBlock.createNode(code.getTextContent())
        code.replace(node)
      }
    }
  }
}


export type TypeToNodeMap = Map<string, NodeMap>;
const cachedNodeMaps = new WeakMap<EditorState, TypeToNodeMap>();
const EMPTY_TYPE_TO_NODE_MAP: TypeToNodeMap = new Map();

/**
 * @internal
 * Compute a Map of node type to nodes for an EditorState
 */
function computeTypeToNodeMap(editorState: EditorState): TypeToNodeMap {
  const typeToNodeMap = new Map();
  for (const [nodeKey, node] of editorState._nodeMap) {
    const nodeType = node.__type;
    let nodeMap = typeToNodeMap.get(nodeType);
    if (!nodeMap) {
      nodeMap = new Map();
      typeToNodeMap.set(nodeType, nodeMap);
    }
    nodeMap.set(nodeKey, node);
  }
  return typeToNodeMap;
}

export function getCachedTypeToNodeMap(
  editorState: EditorState,
): TypeToNodeMap {
  // If this is a new Editor it may have a writable this._editorState
  // with only a 'root' entry.
  if (!editorState._readOnly && editorState.isEmpty()) {
    return EMPTY_TYPE_TO_NODE_MAP;
  }
  invariant(
    editorState._readOnly,
    'getCachedTypeToNodeMap called with a writable EditorState',
  );
  let typeToNodeMap = cachedNodeMaps.get(editorState);
  if (!typeToNodeMap) {
    typeToNodeMap = computeTypeToNodeMap(editorState);
    cachedNodeMaps.set(editorState, typeToNodeMap);
  }
  return typeToNodeMap;
}

export function getNodesOfType<T extends LexicalNode>(klass: Klass<T>, editorState: EditorState): Array<T> {
  const klassType = klass.getType();
  if (editorState._readOnly) {
    const nodes = getCachedTypeToNodeMap(editorState).get(klassType) as
      | undefined
      | Map<string, T>;
    return nodes ? Array.from(nodes.values()) : [];
  }
  const nodes = editorState._nodeMap;
  const nodesOfType: Array<T> = [];
  for (const [, node] of nodes) {
    if (
      node instanceof klass &&
      node.__type === klassType &&
      node.isAttached()
    ) {
      nodesOfType.push(node as T);
    }
  }
  return nodesOfType;
}

export const getFirstImageUrl = (editorState: EditorState) => {
  const image = getNodesOfType(ImageNode, editorState)
  if (image.length > 0) {
    return image[0].getSrc()
  }
  return null
}
