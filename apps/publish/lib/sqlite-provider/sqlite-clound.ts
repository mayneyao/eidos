import { BaseServerDatabase } from "@/lib/sqlite/interface"


export interface SQLiteCloudDomainDbInfo {
    type: "sqlitecloud"
    config: {
        url: string
        dbName: string
        apiKey: string
        version?: string
    }
}

interface SQLiteCloudResponse {
    data: any[]
    metadata: {
        columns: {
            name: string
            type: string
        }[]
    },
}


export class SQLiteCloudServerDatabase extends BaseServerDatabase {
    createFunction() {
        throw new Error('Method not implemented.');
    }
    databaseName: string;
    config: SQLiteCloudDomainDbInfo['config']
    constructor(config: SQLiteCloudDomainDbInfo['config']) {
        super();
        this.databaseName = config.dbName;
        this.config = config
    }

    prepare(sql: string) {
    }

    close() {
    }

    async selectObjects(sql: string): Promise<{ [columnName: string]: any }[]> {
        return await this.call(sql, [])
    }

    async call(sql: string, bind: any[], rowMode: "array" | "object" = "object") {
        const _bind = [...bind]
        // wait support for bind, now just replace ? with value
        const _sql = sql.replace(/\?/g, () => {
            const value = _bind.shift();
            if (typeof value === "string") {
                return `'${value}'`;
            } else if (value === null || value === undefined) {
                return 'NULL';
            } else {
                return value;
            }
        });
        console.log('call', _sql)
        const data = {
            "database": this.config.dbName,
            "sql": _sql,
        }
        const res = await fetch(this.config.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify(data)
        })
        const json = await res.json() as SQLiteCloudResponse
        if (rowMode === "object") {
            return json.data
        }
        const res1 = json.data.map(row => {
            return json.metadata.columns.map((col, index) => {
                return row[col.name]
            })
        })
        return res1
    }

    transaction() {
    }
    async exec(opts: string) {
        if (typeof opts === "string") {
            const rows = await this.selectObjects(opts)
            return rows
        } else if (typeof opts === "object") {
            const { sql, bind, rowMode } = opts
            const rows = await this.call(sql, bind, rowMode)
            return rows
        }
        throw new Error("Invalid opts")
    }

}