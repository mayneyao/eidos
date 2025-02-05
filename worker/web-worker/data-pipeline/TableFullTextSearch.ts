import { isDesktopMode } from "@/lib/env";
import { DataSpace } from "../DataSpace";

export class TableFullTextSearch {
    constructor(private dataspace: DataSpace) { }

    async createDynamicFTS(tableName: string, temporary: boolean = false) {
        const tableInfo = await this.dataspace.db.selectObjects(`PRAGMA table_info(${tableName})`);
        if (!isDesktopMode) {
            throw new Error('Full text search is not supported in web mode');
        }

        const columns = tableInfo
            .map((col: any) => col.name)
            .filter((name: any) => name.toLowerCase() !== 'rowid')
            .join(', ');

        const ftsTableName = `fts_${tableName}`;

        const createFtsSql = `
        CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTableName}
        USING fts5(${columns}, content='${tableName}', tokenize = 'simple');
        `;

        await this.dataspace.db.exec(createFtsSql);

        const syncDataSql = `INSERT INTO ${ftsTableName}(${columns}) SELECT ${columns} FROM ${tableName};`;
        await this.dataspace.db.exec(syncDataSql);

        if (!temporary) {
            const triggerSqls = [
                `CREATE TRIGGER IF NOT EXISTS fts_${tableName}_ai AFTER INSERT ON ${tableName} BEGIN
                    INSERT INTO ${ftsTableName}(${columns}) VALUES (${columns.split(', ').map((c: any) => `new.${c}`).join(', ')});
                END;`,
                `CREATE TRIGGER IF NOT EXISTS fts_${tableName}_ad AFTER DELETE ON ${tableName} BEGIN
                    INSERT INTO ${ftsTableName}(${ftsTableName}, ${columns}) VALUES('delete', ${columns.split(', ').map((c: any) => `old.${c}`).join(', ')});
                END;`,
                `CREATE TRIGGER IF NOT EXISTS fts_${tableName}_au AFTER UPDATE ON ${tableName} BEGIN
                    INSERT INTO ${ftsTableName}(${ftsTableName}, ${columns}) VALUES('delete', ${columns.split(', ').map((c: any) => `old.${c}`).join(', ')});
                    INSERT INTO ${ftsTableName}(${columns}) VALUES (${columns.split(', ').map((c: any) => `new.${c}`).join(', ')});
                END;`
            ];

            for (const sql of triggerSqls) {
                await this.dataspace.db.exec(sql);
                console.log(`Trigger created: ${sql}`);
            }
        }

        console.log(`FTS table ${ftsTableName} created for ${tableName}`);
    }

    /**
     * 基于视图条件进行全文搜索
     * @param tableName 表名
     * @param query 搜索关键词
     * @param viewId 视图ID
     */
    async search(tableName: string, query: string, viewId: string) {
        if (!isDesktopMode) {
            throw new Error('Full text search is not supported in web mode');
        }

        const startTime = performance.now();
        const ftsTableName = `fts_${tableName}`;

        try {
            // 检查 FTS 表是否存在
            const tableExists = await this.dataspace.db.selectObjects(
                `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
                [ftsTableName]
            );

            if (tableExists.length === 0) {
                await this.createDynamicFTS(tableName);
            }

            // 获取视图
            const view = await this.dataspace.view.get(viewId);
            if (!view?.query) {
                throw new Error(`View ${viewId} not found or has no query`);
            }

            // 获取表的列信息
            const tableInfo = await this.dataspace.db.selectObjects(`PRAGMA table_info(${tableName})`);
            const columns = tableInfo
                .map((col: any) => col.name)
                .filter((name: any) => name.toLowerCase() !== 'rowid');

            // 为每一列生成单独的 snippet
            const snippetSelects = columns
                .map((col, idx) => `snippet(${ftsTableName}, ${idx}, '<<', '>>', '...', 64) as snippet_${col}`)
                .join(', ');

            // 获取匹配的 rowid 和每列的 snippet
            const matchSql = `
                SELECT 
                    rowid,
                    ${snippetSelects}
                FROM ${ftsTableName}
                WHERE ${ftsTableName} MATCH ?
            `;

            const matchingInfo = await this.dataspace.db.selectObjects(matchSql, [query]);
            if (matchingInfo.length === 0) {
                return {
                    results: [],
                    searchTime: -1,
                    totalMatches: 0
                }
            }

            const rowidList = matchingInfo.map((r: any) => r.rowid).join(',');
            
            // 使用子查询保留原始视图的排序，确保选择 rowid
            let modifiedViewQuery = `
                WITH original_view AS (
                    SELECT ${tableName}.rowid, v.*, ROW_NUMBER() OVER () as row_index
                    FROM (${view.query}) v
                    JOIN ${tableName} ON ${tableName}._id = v._id
                )
                SELECT * FROM original_view 
                WHERE rowid IN (${rowidList})
            `;

            console.log('Search SQL:', modifiedViewQuery);
            const results = await this.dataspace.db.selectObjects(modifiedViewQuery);

            // 处理结果，解析匹配信息
            const processedResults = results.map((row: any) => {
                const matchInfo = matchingInfo.find((m: any) => m.rowid === row.rowid);
                const rowIndex = row.row_index - 1;
                delete row.row_index;

                const matches = [];
                if (matchInfo) {
                    // 检查每一列的 snippet
                    for (const col of columns) {
                        const snippetKey = `snippet_${col}`;
                        const snippet = matchInfo[snippetKey];
                        
                        // 如果 snippet 包含高亮标记，说明这一列有匹配
                        if (snippet && snippet.includes('<<')) {
                            matches.push({
                                column: col,
                                snippet: snippet
                            });
                        }
                    }
                }

                return {
                    row,
                    matches,
                    rowIndex
                };
            });

            const endTime = performance.now();
            const searchTime = endTime - startTime;

            return {
                results: processedResults,
                searchTime: Math.round(searchTime), // 返回整数毫秒数
                totalMatches: matchingInfo.length
            };
        } catch (error) {
            console.error('Search error:', error);
            throw error;
        }
    }

    // async searchFTS(tableName: string, query: string) { ... }
    // async dropFTS(tableName: string) { ... }
}