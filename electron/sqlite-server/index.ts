import { BaseServerDatabase } from '@/lib/sqlite/interface';
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import console from 'electron-log';

function getResourcePath(relativePath: string): string {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, relativePath);
    } else {
        return path.join(app.getAppPath(), relativePath);
    }
}

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

        const libPath = getResourcePath(`dist-simple/libsimple`);
        const dictPath = getResourcePath('dist-simple/dict');

        console.log('Lib path:', libPath);
        console.log('Dict path:', dictPath);

        try {
            this.db.loadExtension(libPath);
            const row = this.db.prepare('select simple_query(\'pinyin\') as query').get() as any;
            console.log(row.query);
        } catch (error) {
            console.error('Error loading extension:', error);
        }

        if (fs.existsSync(dictPath)) {
            this.db.prepare("select jieba_dict(?)").run(dictPath);
        } else {
            console.log('Dictionary file not found:', dictPath);
        }
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