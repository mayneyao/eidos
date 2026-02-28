import type { ITreeNode } from "../../types/ITreeNode"
import { BaseTreeTable } from "./base"
import { WithNodeOperations } from "./node-operations"
import { WithExtNode } from "./ext-node"
import { WithTreeSearch } from "./search"

export const ComposedTreeTable = WithExtNode(
  WithTreeSearch(WithNodeOperations(BaseTreeTable))
)

export class TreeTable extends ComposedTreeTable {
  // TreeTable specific methods can be added here if needed
}
