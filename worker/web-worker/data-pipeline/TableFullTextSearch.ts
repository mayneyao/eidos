import { DataSpace } from "../DataSpace";

export class TableFullTextSearch {
    constructor(private dataspace: DataSpace) { }

    async createDynamicFTS(tableName: string, temporary: boolean = false) {
        const tableInfo = await this.dataspace.db.selectObjects(`PRAGMA table_info(${tableName})`);

        const columns = tableInfo
            .map((col: any) => col.name)
            .filter((name: any) => name.toLowerCase() !== 'rowid')
            .join(', ');

        const ftsTableName = `fts_${tableName}`;

        const createFtsSql = `
        CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTableName}
        USING fts5(${columns}, content='${tableName}', tokenize='unicode61');
        `;

        await this.dataspace.db.exec(createFtsSql);

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

    async search(tableName: string, query: string, limit: number = 100, offset: number = 0) {
        const ftsTableName = `fts_${tableName}`;

        const tableExists = await this.dataspace.syncExec2(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [ftsTableName]);
        if (!tableExists) {
            throw new Error(`FTS table for ${tableName} does not exist. Please create it first.`);
        }
        console.log(`FTS table for ${tableName} exists.`);

        const searchSql = `
        SELECT ${tableName}.*, rank
        FROM ${tableName}
        JOIN (
            SELECT rowid, rank
            FROM ${ftsTableName}
            WHERE ${ftsTableName} MATCH ?
            ORDER BY rank
            LIMIT ? OFFSET ?
        ) AS fts ON ${tableName}.rowid = fts.rowid
        ORDER BY rank
        `;

        const results = await this.dataspace.syncExec2(searchSql, [query, limit, offset]);
        return results;
    }

    // async searchFTS(tableName: string, query: string) { ... }
    // async dropFTS(tableName: string) { ... }
}