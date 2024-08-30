export abstract class BaseServerDatabase {
    abstract prepare(sql: string): any;
    abstract close(): void;
    abstract selectObjects(sql: string): Promise<{ [columnName: string]: any }[]>;
    abstract transaction(): any;
    abstract exec(opts: any): Promise<any>;
    abstract createFunction(): any;
}
