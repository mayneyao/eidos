function sqliteString(value: string): string {
  if (value.includes("\0"))
    throw new Error("Graft arguments cannot contain NUL")
  return `'${value.replace(/'/g, "''")}'`
}

export function graftSqlitePragmaStatement(
  pragma: string,
  argument?: string
): string {
  if (!/^[a-z][a-z0-9_]*$/.test(pragma)) {
    throw new Error(`Invalid Graft pragma: ${pragma}`)
  }
  const name = `graft_${pragma}`
  return argument === undefined ? name : `${name} = ${sqliteString(argument)}`
}
