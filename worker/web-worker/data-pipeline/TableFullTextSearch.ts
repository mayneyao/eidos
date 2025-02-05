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
     * 全文搜索指定的表，返回匹配到的行，并且明确的指出匹配到的列
     * @param tableName 
     * @param query 
     * @param limit 
     * @param offset 
     * @returns 包含匹配行数据和匹配列信息的结果
     */
    async search(tableName: string, query: string, limit: number = 100, offset: number = 0) {
        if (!isDesktopMode) {
            throw new Error('Full text search is not supported in web mode');
        }
        const ftsTableName = `fts_${tableName}`;

        // 检查 FTS 表是否存在
        const tableExists = await this.dataspace.db.selectObjects(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [ftsTableName]
        );

        if (tableExists.length === 0) {
            // 如果FTS表不存在，先创建它
            await this.createDynamicFTS(tableName);
        }

        // 获取表的列信息
        const tableInfo = await this.dataspace.db.selectObjects(`PRAGMA table_info(${tableName})`);
        const columns = tableInfo
            .map((col: any) => col.name)
            .filter((name: any) => name.toLowerCase() !== 'rowid');


        const sql = `
            SELECT 
                *,
                snippet(${ftsTableName}, -1, '<<', '>>', '...', 64) as snippet
            FROM ${ftsTableName}
            WHERE ${ftsTableName} MATCH ?
            ORDER BY rank
            LIMIT ? OFFSET ?
        `;

        console.log(sql, [query, limit, offset]);
        const results = await this.dataspace.db.selectObjects(sql, [query, limit, offset]);

        // 处理结果，解析匹配信息
        return results.map((row: any) => {
            const snippet = row.snippet;
            delete row.snippet;

            // 解析匹配内容，这里简单地根据 snippet 匹配各个列的内容
            const matches = [];
            if (snippet) {
                for (const col of columns) {
                    const colContent = row[col]?.toString() || '';
                    if (colContent.includes(snippet.replace(/<<|>>/g, ''))) {
                        matches.push({
                            column: col,
                            snippet: snippet
                        });
                    }
                }
            }

            return {
                row,
                matches
            };
        });
    }

    // async searchFTS(tableName: string, query: string) { ... }
    // async dropFTS(tableName: string) { ... }
}