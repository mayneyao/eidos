// https://www.sqlite.org/lang_corefunc.html
// SQLite Core Functions TypeScript Signatures

// https://www.sqlite.org/lang_corefunc.html#abs
declare function abs(value: number | string | null): number | null

// https://www.sqlite.org/lang_corefunc.html#changes
// This function would require a connection to a SQLite database to implement properly.
declare function changes(): number

// https://www.sqlite.org/lang_corefunc.html#char
declare function char(...codes: number[]): string

// https://www.sqlite.org/lang_corefunc.html#coalesce
declare function coalesce(...args: any[]): any

// https://www.sqlite.org/lang_corefunc.html#concat
declare function concat(...args: any[]): string

// https://www.sqlite.org/lang_corefunc.html#concat_ws
declare function concat_ws(separator: string, ...args: any[]): string

// https://www.sqlite.org/lang_corefunc.html#format
declare function format(format: string, ...args: any[]): string

// https://www.sqlite.org/lang_corefunc.html#glob
declare function glob(pattern: string, value: string): boolean

// https://www.sqlite.org/lang_corefunc.html#hex
declare function hex(value: number | string): string

// https://www.sqlite.org/lang_corefunc.html#ifnull
declare function ifnull(x: any, y: any): any

// https://www.sqlite.org/lang_corefunc.html#iif
declare function iif(condition: boolean, trueValue: any, falseValue: any): any

// https://www.sqlite.org/lang_corefunc.html#instr
declare function instr(x: string, y: string): number

// https://www.sqlite.org/lang_corefunc.html#last_insert_rowid
// This function would require a connection to a SQLite database to implement properly.
declare function last_insert_rowid(): number

// https://www.sqlite.org/lang_corefunc.html#length
declare function length(x: string | null): number | null

// https://www.sqlite.org/lang_corefunc.html#like
declare function like(x: string, y: string): boolean

// https://www.sqlite.org/lang_corefunc.html#likelihood
declare function likelihood(x: any, y: number): any

// https://www.sqlite.org/lang_corefunc.html#likely
declare function likely(x: any): any

// https://www.sqlite.org/lang_corefunc.html#load_extension
// This function would require a connection to a SQLite database to implement properly.
declare function load_extension(x: string, y?: string): null

// https://www.sqlite.org/lang_corefunc.html#lower
declare function lower(x: string): string

// https://www.sqlite.org/lang_corefunc.html#ltrim
declare function ltrim(x: string, y?: string): string
// https://www.sqlite.org/lang_corefunc.html#max
declare function max(...args: any[]): any

// https://www.sqlite.org/lang_corefunc.html#min
declare function min(...args: any[]): any

// https://www.sqlite.org/lang_corefunc.html#nullif
declare function nullif(x: any, y: any): any

// https://www.sqlite.org/lang_corefunc.html#octet_length
declare function octet_length(x: any): number | null

// https://www.sqlite.org/lang_corefunc.html#printf
declare function printf(format: string, ...args: any[]): string

// https://www.sqlite.org/lang_corefunc.html#quote
declare function quote(x: any): string

// https://www.sqlite.org/lang_corefunc.html#random
declare function random(): number

// https://www.sqlite.org/lang_corefunc.html#randomblob
declare function randomblob(n: number): any

// https://www.sqlite.org/lang_corefunc.html#replace
declare function replace(x: string, y: string, z: string): string

// https://www.sqlite.org/lang_corefunc.html#round
declare function round(x: number, y?: number): number

// https://www.sqlite.org/lang_corefunc.html#rtrim
declare function rtrim(x: string, y?: string): string

// https://www.sqlite.org/lang_corefunc.html#sign
declare function sign(x: number): number | null

// https://www.sqlite.org/lang_corefunc.html#soundex
declare function soundex(x: string): string

// https://www.sqlite.org/lang_corefunc.html#sqlite_compileoption_get
declare function sqlite_compileoption_get(n: number): string | null

// https://www.sqlite.org/lang_corefunc.html#sqlite_compileoption_used
declare function sqlite_compileoption_used(x: string): number

// https://www.sqlite.org/lang_corefunc.html#sqlite_offset
declare function sqlite_offset(x: any): number | null

// https://www.sqlite.org/lang_corefunc.html#sqlite_source_id
declare function sqlite_source_id(): string

// https://www.sqlite.org/lang_corefunc.html#sqlite_version
declare function sqlite_version(): string

// https://www.sqlite.org/lang_corefunc.html#substr
declare function substr(x: string, y: number, z?: number): string

// https://www.sqlite.org/lang_corefunc.html#total_changes
declare function total_changes(): number

// https://www.sqlite.org/lang_corefunc.html#trim
declare function trim(x: string, y?: string): string

// https://www.sqlite.org/lang_corefunc.html#typeof
// declare function typeof(x: any): string;

// https://www.sqlite.org/lang_corefunc.html#unhex
declare function unhex(x: string, y?: string): any

// https://www.sqlite.org/lang_corefunc.html#unicode
declare function unicode(x: string): number | undefined

// https://www.sqlite.org/lang_corefunc.html#unlikely
declare function unlikely(x: any): any

// https://www.sqlite.org/lang_corefunc.html#upper
declare function upper(x: string): string

// https://www.sqlite.org/lang_corefunc.html#zeroblob
declare function zeroblob(n: number): any

/**
 * ------------ udf ----------------
 */
function props(name: string): string
function today(): string
