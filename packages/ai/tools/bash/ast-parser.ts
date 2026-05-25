// ── bashkit AST types ──────────────────────────────────────────

interface AstWord {
  parts: Array<{ Literal?: string; Variable?: string }>
  quoted?: boolean
}

export interface AstSimple {
  name: AstWord
  args: AstWord[]
  redirects: unknown[]
  assignments: unknown[]
}

interface AstPipeline {
  commands: Array<{ Simple?: AstSimple }>
}

interface AstStatement {
  Simple?: AstSimple
  Pipeline?: AstPipeline
  Compound?: { body: AstStatement[]; condition?: AstStatement[] }
  Subshell?: { body: AstStatement[] }
  FunctionDef?: { body: AstStatement[] }
  Background?: AstStatement
}

export interface AstScript {
  commands: AstStatement[]
}

// ── AST utilities ──────────────────────────────────────────────

/** Extract text from a bashkit AST word ({ parts: [{ Literal: "echo" }] }). */
export function wordText(word: AstWord): string {
  return word.parts.map((p) => p.Literal || p.Variable || "").join("")
}

/** Walk the AST and collect all command names (pipes, compounds, subshells). */
export function extractCommandNames(ast: AstScript): string[] {
  const names: string[] = []
  for (const stmt of ast.commands) {
    collectNames(stmt, names)
  }
  return names
}

function collectNames(node: AstStatement, out: string[]): void {
  if (node.Pipeline?.commands) {
    for (const cmd of node.Pipeline.commands) {
      if (cmd.Simple) out.push(wordText(cmd.Simple.name))
    }
  }
  if (node.Simple) out.push(wordText(node.Simple.name))
  for (const s of node.Compound?.body ?? []) collectNames(s, out)
  for (const s of node.Subshell?.body ?? []) collectNames(s, out)
  for (const s of node.FunctionDef?.body ?? []) collectNames(s, out)
  if (node.Background) collectNames(node.Background, out)
}

/** Find the first Simple node matching a command name in the AST. */
export function findFirstCommand(
  ast: AstScript,
  name: string
): AstSimple | null {
  return searchCommand(ast.commands, name)
}

function searchCommand(stmts: AstStatement[], name: string): AstSimple | null {
  for (const stmt of stmts) {
    if (stmt.Pipeline?.commands) {
      for (const cmd of stmt.Pipeline.commands) {
        if (cmd.Simple && wordText(cmd.Simple.name) === name) return cmd.Simple
      }
    }
    if (stmt.Simple && wordText(stmt.Simple.name) === name) return stmt.Simple
    const found =
      searchCommand(stmt.Compound?.body ?? [], name) ??
      searchCommand(stmt.Subshell?.body ?? [], name)
    if (found) return found
  }
  return null
}
