/**
 * [{count:0}] => TEXT
 * [{count:0, name: 'a'}] => CARD
 * [{count:0}, {count:1}] => LIST
 * [{count:0, name: 'a'}, {count:1, name: 'b'}] => TABLE
 * @param data
 */

export enum QueryResultType {
  TEXT = "TEXT",
  CARD = "CARD",
  LIST = "LIST",
  TABLE = "TABLE",
}
export const getQueryResultType = (data: object[]) => {
  if (data.length === 0) {
    return QueryResultType.TEXT
  }
  if (Object.keys(data[0]).length === 1) {
    return data.length === 1 ? QueryResultType.TEXT : QueryResultType.LIST
  }
  return data.length === 1 ? QueryResultType.CARD : QueryResultType.TABLE
}
