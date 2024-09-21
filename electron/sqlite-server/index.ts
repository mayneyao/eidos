import { BaseServerDatabase } from '@/lib/sqlite/interface';
import Database from 'better-sqlite3';
import path from 'path';

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
        this.db.loadExtension(path.join(__dirname, '../dist-simple/libsimple'))
        const row = this.db.prepare('select simple_query(\'pinyin\') as query').get() as any;
        console.log(row.query);
        // set the jieba dict file path
        this.db.prepare("select jieba_dict(?)").run(path.join(__dirname, '../dist-simple/dict'));
    }

    prepare(sql: string): any {
        return this.db.prepare(sql);
    }
    close() {
        this.db.close();
    }

    async selectObjects(sql: string, bind?: any[]): Promise<{ [columnName: string]: any }[]> {
        const stmt = this.db.prepare(sql);
        if (bind != null) {
            return stmt.all(bind) as { [columnName: string]: any }[];
        }
        return stmt.all() as { [columnName: string]: any }[];
    }

    transaction(func: (db: NodeServerDatabase) => void) {
        const transaction = this.db.transaction(func);
        transaction(this);
        return
    }

    async exec(opts: { sql: string; bind?: any[]; rowMode?: "array" | "object" }) {
        if (typeof opts === 'string') {
            return this.db.exec(opts);
        } else if (typeof opts === 'object') {
            const { sql, bind } = opts;
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
                if (_bind == null) {
                    return stmt.run();
                }
                return stmt.run(_bind);
            }
            if (opts.rowMode === 'array') {
                return res.map((item: any) => Object.values(item));
            }
            return res
        }
        return [];
    }

    createFunction(opt: { name: string; xFunc: (...args: any[]) => any }) {
        this.db.function(opt.name, opt.xFunc)
    }
}