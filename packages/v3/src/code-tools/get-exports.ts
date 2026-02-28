import { parseSync } from "oxc-parser"

export const getExports = (code: string) => {
  const ast = parseSync("index.ts", code)
  console.log(ast.program.body)
}
