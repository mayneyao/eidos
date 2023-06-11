import { Parser } from 'sql-ddl-to-json-schema'

const parser = new Parser('mysql');


export function sqlToJSONSchema2(sqlQuery: string) {
  return parser.feed(sqlQuery).toCompactJson()
}
