import type { BaseTreeTable } from "./base";

// Mixin to add tree search functionality
type Constructor<T = {}> = new (...args: any[]) => T & BaseTreeTable;

export function WithTreeSearch<T extends Constructor>(Base: T) {
    return class TreeSearchMixin extends Base {
        /**
         * Search tree nodes using recursive path-based search
         * @param searchTerm search term to match in the full path
         * @returns array of matching tree nodes with their full paths
         */
        public async searchTreeByPath(searchTerm: string): Promise<Array<{
            id: string;
            name: string;
            full_path: string;
            depth: number;
            position: number;
            type: string;
        }>> {
            const sql = `
                WITH RECURSIVE tree_path AS (
                    -- 基础情况：选择根节点（parent_id 为 NULL）
                    SELECT 
                        id,
                        name,
                        type,
                        parent_id,
                        name AS full_path,
                        1 AS depth,
                        position,
                        printf('%020.3f', position) AS sort_path
                    FROM ${this.name}
                    WHERE parent_id IS NULL
                        AND is_deleted = 0

                    UNION ALL

                    -- 递归部分：连接子节点，构建路径和排序键
                    SELECT 
                        t.id,
                        t.name,
                        t.type,
                        t.parent_id,
                        p.full_path || '/' || t.name AS full_path,
                        p.depth + 1 AS depth,
                        t.position,
                        p.sort_path || '/' || printf('%020.3f', t.position) AS sort_path
                    FROM ${this.name} t
                    INNER JOIN tree_path p ON t.parent_id = p.id
                        AND p.type = 'folder'
                    WHERE t.is_deleted = 0
                )
                SELECT 
                    id,
                    name,
                    full_path,
                    depth,
                    position,
                    type
                FROM tree_path
                WHERE full_path LIKE ?
                ORDER BY sort_path
            `;

            const results = await this.dataSpace.exec2(sql, [`%${searchTerm}%`]);
            return results;
        }

        /**
         * Get the full path of a specific node
         * @param nodeId the ID of the node
         * @returns the full path string or null if not found
         */
        public async getNodeFullPath(nodeId: string): Promise<string | null> {
            const sql = `
                WITH RECURSIVE tree_path AS (
                    -- 基础情况：选择根节点（parent_id 为 NULL）
                    SELECT 
                        id,
                        name,
                        type,
                        parent_id,
                        name AS full_path,
                        1 AS depth
                    FROM ${this.name}
                    WHERE parent_id IS NULL
                        AND is_deleted = 0

                    UNION ALL

                    -- 递归部分：连接子节点，构建路径
                    SELECT 
                        t.id,
                        t.name,
                        t.type,
                        t.parent_id,
                        p.full_path || '/' || t.name AS full_path,
                        p.depth + 1 AS depth
                    FROM ${this.name} t
                    INNER JOIN tree_path p ON t.parent_id = p.id
                        AND p.type = 'folder'
                    WHERE t.is_deleted = 0
                )
                SELECT full_path
                FROM tree_path
                WHERE id = ?
            `;

            const results = await this.dataSpace.exec2(sql, [nodeId]);
            return results.length > 0 ? results[0].full_path : null;
        }

        /**
         * Get all tree nodes with their full paths (for debugging or display)
         * @returns array of all tree nodes with their full paths
         */
        public async getAllTreePaths(): Promise<Array<{
            id: string;
            name: string;
            full_path: string;
            depth: number;
            position: number;
            type: string;
        }>> {
            const sql = `
                WITH RECURSIVE tree_path AS (
                    -- 基础情况：选择根节点（parent_id 为 NULL）
                    SELECT 
                        id,
                        name,
                        type,
                        parent_id,
                        name AS full_path,
                        1 AS depth,
                        position,
                        printf('%020.3f', position) AS sort_path
                    FROM ${this.name}
                    WHERE parent_id IS NULL
                        AND is_deleted = 0

                    UNION ALL

                    -- 递归部分：连接子节点，构建路径和排序键
                    SELECT 
                        t.id,
                        t.name,
                        t.type,
                        t.parent_id,
                        p.full_path || '/' || t.name AS full_path,
                        p.depth + 1 AS depth,
                        t.position,
                        p.sort_path || '/' || printf('%020.3f', t.position) AS sort_path
                    FROM ${this.name} t
                    INNER JOIN tree_path p ON t.parent_id = p.id
                        AND p.type = 'folder'
                    WHERE t.is_deleted = 0
                )
                SELECT 
                    id,
                    name,
                    full_path,
                    depth,
                    position,
                    type
                FROM tree_path
                ORDER BY sort_path
            `;

            const results = await this.dataSpace.exec2(sql);
            return results;
        }
    };
}
