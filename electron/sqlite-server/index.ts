import { BaseServerDatabase } from '@/lib/sqlite/interface';
import Database from 'better-sqlite3';

export interface NodeDomainDbInfo {
    type: 'node';
    config: {
        path: string;
        options?: Database.Options;
    };
}

export class NodeServerDatabase extends BaseServerDatabase {
    db: Database.Database;
    constructor(config: NodeDomainDbInfo['config']) {
        super();
        this.db = new Database(config.path, config.options);
    }

    prepare(): any { }
    close() {
        this.db.close();
    }

    async selectObjects(sql: string): Promise<{ [columnName: string]: any }[]> {
        const stmt = this.db.prepare(sql);
        return stmt.all() as { [columnName: string]: any }[];
    }

    transaction(func: (db: NodeServerDatabase) => void) {
        const transaction = this.db.transaction(func);
        transaction(this);
        return
    }

    async exec(opts: { sql: string; bind?: any[]; rowMode?: "array" | "object" }) {
        console.log(opts)
        try {
            if (typeof opts === 'string') {
                const stmt = this.db.prepare(opts);
                return stmt.run();
            } else if (typeof opts === 'object') {
                const { sql, bind } = opts;
                if (!bind) {
                    const sqlStatements = opts.sql.split(';').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);
                    for (const _stmt of sqlStatements) {
                        const stmt = this.db.prepare(_stmt);
                        stmt.run();
                    }
                    return
                }
                const _bind = bind?.map((item: any) => {
                    // if item is boolean return 1 or 0
                    if (typeof item === 'boolean') {
                        return item ? 1 : 0;
                    }
                    return item;
                })
                const stmt = this.db.prepare(sql);
                let res = null
                if (stmt.readonly) {
                    res = stmt.all(_bind);
                } else {
                    return stmt.run(_bind);
                }
                if (opts.rowMode === 'array') {
                    return res.map((item: any) => Object.values(item));
                }
                return res
            }
        } catch (error) {
            console.log(error, opts)
        }
        return [];
    }

    createFunction(opt: { name: string; xFunc: (...args: any[]) => any }) {
        this.db.function(opt.name, opt.xFunc)
    }
}