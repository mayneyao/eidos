import { extractIdFromShortId, getRawTableNameById } from "@/lib/utils";
import type { BaseTreeTable } from "./base";
import { checkForLoop, buildAdjacencyList, calculateNewPosition } from "./helper";

// Mixin to add high-level node operations
type Constructor<T = {}> = new (...args: any[]) => T & BaseTreeTable;

export function WithNodeOperations<T extends Constructor>(Base: T) {
    return class NodeOperationsTreeTableMixin extends Base {
        // High-level node operations
        public async listNodes(query?: string, withSubNode?: boolean): Promise<any[]> {
            return this.query({ query, withSubNode })
        }

        public async pinNode(id: string, isPinned: boolean): Promise<boolean> {
            return this.pin(id, isPinned)
        }

        public async toggleNodeFullWidth(id: string, isFullWidth: boolean): Promise<boolean> {
            return this.set(id, {
                is_full_width: isFullWidth,
            })
        }

        public async toggleNodeLock(id: string, isLocked: boolean): Promise<boolean> {
            return this.set(id, {
                is_locked: isLocked,
            })
        }

        public async updateNodeName(id: string, name: string): Promise<void> {
            const node = await this.get(id)
            if (node?.name === name) {
                return
            }
            return this.dataSpace.db.transaction(async () => {
                // FIXME: should use db transaction to execute multiple sql
                await this.updateName(id, name)
                // if this node is subDoc, we need to update row.title
                if (node?.parent_id) {
                    const parent = await this.get(node.parent_id)
                    if (parent && parent.type === "table") {
                        const tableRawName = getRawTableNameById(parent.id)
                        await this.dataSpace.syncExec2(
                            `UPDATE ${tableRawName} SET title = ? WHERE _id = ?`,
                            [name, extractIdFromShortId(id)]
                        )
                    }
                }
            })
        }

        public async addNode(data: any): Promise<any> {
            return this.add(data)
        }

        public async getOrCreateNode(data: any): Promise<any> {
            const node = await this.get(data.id)
            const _data = { ...data }
            const parent = data.parent_id && (await this.getNode(data.parent_id))
            if (parent && parent.type === "table") {
                const tableRawName = getRawTableNameById(parent.id)
                // fix parent_id
                _data.parent_id = parent.id
                await this.dataSpace.syncExec2(
                    `INSERT OR IGNORE INTO ${tableRawName} (_id,title) VALUES (?,?);`,
                    [extractIdFromShortId(data.id), data.name]
                )
            }
            if (node) {
                return node
            }
            return this.add(_data)
        }

        public async nodeChangeParent(
            id: string,
            parentId?: string,
            opts?: {
                targetId: string
                targetDirection: "up" | "down"
            }
        ): Promise<Partial<any>> {
            if (parentId) {
                await this.checkLoop(id, parentId)
            }
            let data: Partial<any> = {
                parent_id: parentId,
            }
            if (opts) {
                const newPosition = await this.getPosition({
                    parentId,
                    targetId: opts.targetId,
                    targetDirection: opts.targetDirection,
                })
                data = {
                    ...data,
                    position: newPosition,
                }
            }
            await this.set(id, data)
            return data
        }

        public async restoreNode(id: string): Promise<boolean> {
            return this.set(id, {
                is_deleted: false,
            })
        }

        public async deleteNode(id: string): Promise<boolean> {
            return this.set(id, {
                is_deleted: true,
            })
        }

        public async checkLoop(id: string, parentId: string) {
            if (id === parentId) {
                throw new Error("Can't move into a child node")
            } else {
                const adjacencyList = await this.getAdjacencyList()
                const hasLoop = checkForLoop(id, parentId, adjacencyList)
                if (hasLoop) {
                    throw new Error("Can't move into a child node")
                }
                // ... continue with changing the parent
            }
        }

        public async getAdjacencyList(): Promise<Map<string, string[]>> {
            const res = await this.dataSpace.exec2(
                `SELECT id, parent_id FROM ${this.name}`
            )
            return buildAdjacencyList(res)
        }

        // Position-related methods
        public async getPosition(props: {
            parentId?: string
            targetId: string
            targetDirection: "up" | "down"
        }): Promise<number> {
            const { parentId, targetId, targetDirection } = props
            const parentChildren = await this.list(
                { parent_id: parentId || null },
                {
                    orderBy: "position",
                    order: "DESC",
                }
            )
            return calculateNewPosition(parentChildren, targetId, targetDirection)
        }

        public async updateNodePosition(id: string, position: number): Promise<boolean> {
            return this.set(id, {
                position,
            })
        }
    };
}
