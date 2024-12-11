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