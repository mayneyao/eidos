// [{key:value}] => value
export const getQueryResultText = (data: any) => {
  if (data.length === 0) {
    return "[Null]"
  }

  if (data.length === 1) {
    return data[0][Object.keys(data[0])[0]]
  }
  return "[ERROR]"
}
