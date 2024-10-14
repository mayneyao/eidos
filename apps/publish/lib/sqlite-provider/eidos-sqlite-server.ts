import { BaseServerDatabase } from "@/lib/sqlite/interface";

export interface EidosSQLiteServerDomainDbInfo {
    type: "eidosSqliteServer";
    config: {
        url: string;
        dbName: string;
        version?: string;
    };
}

export class EidosSQLiteServerDatabase extends BaseServerDatabase {
    createFunction() {
        throw new Error('Method not implemented.');
    }

    databaseName: string;
    config: EidosSQLiteServerDomainDbInfo['config'];

    constructor(config: EidosSQLiteServerDomainDbInfo['config']) {
        super();
        this.databaseName = config.dbName;
        this.config = config;
    }

    prepare(sql: string) {
        // Not implemented
    }

    close() {
        // Not implemented
    }

    async selectObjects(sql: string, bind: any[] = []): Promise<{ [columnName: string]: any }[]> {
        const result = await this.queryDatabase(sql, bind);
        return result;
    }

    async call(sql: string, bind: any[] = [], rowMode: "array" | "object" = "object") {
        const result = await this.queryDatabase(sql, bind);
        if (rowMode === "object") {
            return result;
        } else {
            // Convert result to array mode if needed
            return result.map((row: any) => Object.values(row));
        }
    }

    transaction() {
        // Not implemented
    }

    async exec(opts: string | { sql: string; bind?: any[]; rowMode?: "array" | "object" }) {
        if (typeof opts === "string") {
            const rows = await this.selectObjects(opts);
            return rows;
        } else if (typeof opts === "object") {
            const { sql, bind = [], rowMode = "object" } = opts;
            const rows = await this.call(sql, bind, rowMode);
            return rows;
        }
        throw new Error("Invalid opts");
    }

    private async queryDatabase(sql: string, bind: any[] = []) {
        const response = await fetch(this.config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dbName: this.config.dbName, sql, bind }),
        });

        if (!response.ok) {
            throw new Error(`query failed: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        return result;
    }
}
