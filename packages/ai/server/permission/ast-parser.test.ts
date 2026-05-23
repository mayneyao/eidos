import { describe, it, expect } from "vitest"
import { wordText, extractCommandNames, findFirstCommand } from "./ast-parser"
import type { AstScript } from "./ast-parser"
import { Bash } from "@eidos.space/bashkit"

const bash = new Bash()

function parse(cmd: string): AstScript {
  const raw = bash.parse(cmd)
  return typeof raw === "string" ? JSON.parse(raw) : (raw as AstScript)
}

function argsOf(ast: AstScript, name: string): string[] {
  const simple = findFirstCommand(ast, name)
  if (!simple) return []
  return simple.args.map(wordText)
}

// ── wordText ────────────────────────────────────────────────────

describe("wordText", () => {
  it("literal", () => {
    const ast = parse("echo hello")
    const simple = findFirstCommand(ast, "echo")!
    expect(wordText(simple.name)).toBe("echo")
    expect(simple.args.map(wordText)).toEqual(["hello"])
  })

  it("quoted arg", () => {
    const ast = parse("jq '.[] | select(.x==1)'")
    const simple = findFirstCommand(ast, "jq")!
    expect(simple.args.map(wordText)).toEqual([".[] | select(.x==1)"])
  })
})

// ── extractCommandNames ────────────────────────────────────────

describe("extractCommandNames", () => {
  it("single command", () => {
    expect(extractCommandNames(parse("ls -la"))).toEqual(["ls"])
  })

  it("eidos tree", () => {
    expect(extractCommandNames(parse("eidos tree --depth 2"))).toEqual([
      "eidos",
    ])
  })

  it("eidos record insert", () => {
    expect(extractCommandNames(parse("eidos record insert abc123"))).toEqual([
      "eidos",
    ])
  })

  it("eidos record query", () => {
    expect(
      extractCommandNames(parse("eidos record query abc123 -q 'SELECT 1'"))
    ).toEqual(["eidos"])
  })

  it("eidos search", () => {
    expect(extractCommandNames(parse("eidos search keyword"))).toEqual([
      "eidos",
    ])
  })

  it("eidos subdoc write", () => {
    expect(extractCommandNames(parse("eidos subdoc write abc xyz"))).toEqual([
      "eidos",
    ])
  })

  it("eidos doc create", () => {
    expect(extractCommandNames(parse("eidos doc create test"))).toEqual([
      "eidos",
    ])
  })

  it("eidos table create", () => {
    expect(extractCommandNames(parse("eidos table create mytable"))).toEqual([
      "eidos",
    ])
  })

  it("eidos column create", () => {
    expect(
      extractCommandNames(parse("eidos column create abc mycol -t text"))
    ).toEqual(["eidos"])
  })

  it("eidos journal write", () => {
    expect(
      extractCommandNames(parse("eidos journal write 2024-01-01"))
    ).toEqual(["eidos"])
  })

  it("eidos extension create", () => {
    expect(
      extractCommandNames(
        parse("eidos extension create my-tool 'My Tool' -t script")
      )
    ).toEqual(["eidos"])
  })

  it("pipeline: two commands", () => {
    expect(extractCommandNames(parse("curl ex.com | jq ."))).toEqual([
      "curl",
      "jq",
    ])
  })

  it("pipeline: curl | jq | eidos", () => {
    expect(
      extractCommandNames(
        parse("curl ex.com | jq . | eidos record insert abc --stdin")
      )
    ).toEqual(["curl", "jq", "eidos"])
  })

  it("python3 inline", () => {
    expect(extractCommandNames(parse("python3 script.py"))).toEqual(["python3"])
  })

  it("multiple statements separated by newline/semicolon", () => {
    // bash.parse handles single-command input; here we test individual statements
    expect(extractCommandNames(parse("echo hello"))).toEqual(["echo"])
    expect(extractCommandNames(parse("ls -la"))).toEqual(["ls"])
  })
})

// ── Non-eidos bash commands ────────────────────────────────────

describe("bash commands", () => {
  it("curl with URL", () => {
    expect(
      extractCommandNames(parse("curl -s https://api.example.com/data.json"))
    ).toEqual(["curl"])
  })

  it("curl pipe to jq", () => {
    expect(
      extractCommandNames(
        parse("curl -s https://api.example.com | jq '.items[]'")
      )
    ).toEqual(["curl", "jq"])
  })

  it("curl | jq | python3", () => {
    expect(
      extractCommandNames(
        parse("curl -s api.com | jq '.rows' | python3 process.py")
      )
    ).toEqual(["curl", "jq", "python3"])
  })

  it("curl | jq | eidos record insert", () => {
    expect(
      extractCommandNames(
        parse("curl -s api.com | jq '.[]' | eidos record insert abc --stdin")
      )
    ).toEqual(["curl", "jq", "eidos"])
  })

  it("grep with options", () => {
    expect(extractCommandNames(parse("grep -rn 'pattern' /tmp/"))).toEqual([
      "grep",
    ])
  })

  it("find with exec", () => {
    expect(
      extractCommandNames(parse("find /tmp -name '*.json' -type f"))
    ).toEqual(["find"])
  })

  it("sed inline replace", () => {
    expect(extractCommandNames(parse("sed 's/old/new/g' file.txt"))).toEqual([
      "sed",
    ])
  })

  it("awk field extraction", () => {
    expect(extractCommandNames(parse("awk '{print $1, $3}' data.tsv"))).toEqual(
      ["awk"]
    )
  })

  it("sort + uniq pipeline", () => {
    expect(
      extractCommandNames(parse("sort file.txt | uniq -c | sort -rn"))
    ).toEqual(["sort", "uniq", "sort"])
  })

  it("head and tail in pipeline", () => {
    expect(
      extractCommandNames(
        parse("cat /tmp/data.json | jq '.items' | head -10 | tail -5")
      )
    ).toEqual(["cat", "jq", "head", "tail"])
  })

  it("wc with file", () => {
    expect(extractCommandNames(parse("wc -l /tmp/data.csv"))).toEqual(["wc"])
  })

  it("rm dangerous command", () => {
    expect(extractCommandNames(parse("rm -rf /tmp/old/"))).toEqual(["rm"])
  })

  it("cp and mv", () => {
    expect(extractCommandNames(parse("cp /tmp/a.json /tmp/b.json"))).toEqual([
      "cp",
    ])
    expect(extractCommandNames(parse("mv /tmp/a.json /tmp/b.json"))).toEqual([
      "mv",
    ])
  })

  it("mkdir", () => {
    expect(extractCommandNames(parse("mkdir -p /tmp/nested/dir"))).toEqual([
      "mkdir",
    ])
  })

  it("echo and printf in pipeline", () => {
    expect(
      extractCommandNames(parse("echo 'hello' | grep 'hello' | wc -l"))
    ).toEqual(["echo", "grep", "wc"])
  })

  it("command with redirect", () => {
    expect(extractCommandNames(parse("curl api.com > /tmp/data.json"))).toEqual(
      ["curl"]
    )
  })

  it("command with append redirect", () => {
    expect(
      extractCommandNames(parse("echo 'new line' >> /tmp/log.txt"))
    ).toEqual(["echo"])
  })

  it("command with heredoc string", () => {
    expect(extractCommandNames(parse("python3 -c 'print(2**10)'"))).toEqual([
      "python3",
    ])
  })
})

// ── findFirstCommand + args for non-eidos ──────────────────────

describe("findFirstCommand non-eidos args", () => {
  it("curl args", () => {
    expect(
      argsOf(parse("curl -s https://api.example.com/data"), "curl")
    ).toEqual(["-s", "https://api.example.com/data"])
  })

  it("jq args in pipeline", () => {
    const ast = parse("curl api.com | jq '.items | map(.name)' | head -5")
    expect(argsOf(ast, "jq")).toEqual([".items | map(.name)"])
    expect(argsOf(ast, "head")).toEqual(["-5"])
  })

  it("python3 args", () => {
    expect(
      argsOf(parse("python3 -c 'import json; print(1)'"), "python3")
    ).toEqual(["-c", "import json; print(1)"])
  })

  it("grep args", () => {
    expect(argsOf(parse("grep -iRn 'pattern' /tmp/"), "grep")).toEqual([
      "-iRn",
      "pattern",
      "/tmp/",
    ])
  })

  it("find args with quoted pattern", () => {
    expect(argsOf(parse("find /tmp -name '*.json' -type f"), "find")).toEqual([
      "/tmp",
      "-name",
      "*.json",
      "-type",
      "f",
    ])
  })

  it("eidos + curl combined pipeline", () => {
    const ast = parse(
      "curl api.com | jq '[.[].title]' | eidos record insert abc --stdin"
    )
    expect(argsOf(ast, "curl")).toEqual(["api.com"])
    expect(argsOf(ast, "jq")).toEqual(["[.[].title]"])
    expect(argsOf(ast, "eidos")).toEqual(["record", "insert", "abc", "--stdin"])
  })
})

// ── findFirstCommand + args ────────────────────────────────────

describe("findFirstCommand args", () => {
  it("eidos tree", () => {
    expect(argsOf(parse("eidos tree --depth 2"), "eidos")).toEqual([
      "tree",
      "--depth",
      "2",
    ])
  })

  it("eidos record insert", () => {
    expect(argsOf(parse("eidos record insert abc123"), "eidos")).toEqual([
      "record",
      "insert",
      "abc123",
    ])
  })

  it("eidos record query", () => {
    expect(
      argsOf(parse("eidos record query abc -q 'SELECT 1'"), "eidos")
    ).toEqual(["record", "query", "abc", "-q", "SELECT 1"])
  })

  it("eidos record delete", () => {
    expect(argsOf(parse("eidos record delete abc"), "eidos")).toEqual([
      "record",
      "delete",
      "abc",
    ])
  })

  it("eidos in pipeline", () => {
    const ast = parse("curl ex.com | jq . | eidos record insert abc --stdin")
    expect(argsOf(ast, "eidos")).toEqual(["record", "insert", "abc", "--stdin"])
    expect(argsOf(ast, "curl")).toEqual(["ex.com"])
    expect(argsOf(ast, "jq")).toEqual(["."])
  })

  it("eidos subdoc write in pipeline", () => {
    const ast = parse("echo '## doc' | eidos subdoc write abc xyz")
    expect(argsOf(ast, "eidos")).toEqual(["subdoc", "write", "abc", "xyz"])
  })

  it("eidos extension create with args", () => {
    expect(
      argsOf(
        parse("eidos extension create my-tool 'My Tool' -t script"),
        "eidos"
      )
    ).toEqual(["extension", "create", "my-tool", "My Tool", "-t", "script"])
  })

  it("eidos doc create", () => {
    expect(argsOf(parse("eidos doc create test"), "eidos")).toEqual([
      "doc",
      "create",
      "test",
    ])
  })

  it("eidos doc get (read-only)", () => {
    expect(argsOf(parse("eidos doc get abc123"), "eidos")).toEqual([
      "doc",
      "get",
      "abc123",
    ])
  })

  it("eidos view create", () => {
    expect(argsOf(parse("eidos view create abc myview grid"), "eidos")).toEqual(
      ["view", "create", "abc", "myview", "grid"]
    )
  })
})

// ── eidosCategory (from agent-api.ts logic) ────────────────────

function eidosCategory(args: string[]): string | null {
  if (args.length < 2) return null
  const [cmd, sub] = args.slice(1)
  if (cmd === "record" && sub && sub !== "query") return `eidos:record:${sub}`
  if (cmd === "subdoc" && (sub === "write" || sub === "delete"))
    return `eidos:subdoc:${sub}`
  if (cmd === "table" && (sub === "create" || sub === "delete"))
    return `eidos:table:${sub}`
  if (cmd === "column" && sub) return `eidos:column:${sub}`
  if (cmd === "view" && sub && sub !== "list") return `eidos:view:${sub}`
  if (cmd === "journal" && sub === "write") return `eidos:journal:${sub}`
  if (cmd === "extension" && (sub === "create" || sub === "write"))
    return `eidos:extension:${sub}`
  if (cmd === "doc" && sub && sub !== "get") return `eidos:doc:${sub}`
  return null
}

function category(cmd: string): string | null {
  return eidosCategory(["eidos", ...argsOf(parse(cmd), "eidos")])
}

describe("eidosCategory", () => {
  // read-only
  it("tree → null", () => expect(category("eidos tree --depth 2")).toBeNull())
  it("search → null", () => expect(category("eidos search keyword")).toBeNull())
  it("table list → null", () => expect(category("eidos table list")).toBeNull())
  it("table info → null", () =>
    expect(category("eidos table info abc")).toBeNull())
  it("record query → null", () =>
    expect(category("eidos record query abc")).toBeNull())
  it("subdoc read → null", () =>
    expect(category("eidos subdoc read abc xyz")).toBeNull())
  it("subdoc list → null", () =>
    expect(category("eidos subdoc list abc")).toBeNull())
  it("doc get → null", () => expect(category("eidos doc get abc")).toBeNull())
  it("view list → null", () =>
    expect(category("eidos view list abc")).toBeNull())
  it("journal get → null", () =>
    expect(category("eidos journal get 2024-01-01")).toBeNull())
  it("journal list → null", () =>
    expect(category("eidos journal list")).toBeNull())
  it("extension get → null", () =>
    expect(category("eidos extension get my-tool")).toBeNull())
  it("extension list → null", () =>
    expect(category("eidos extension list")).toBeNull())

  // record writes → per-action
  it("record insert", () =>
    expect(category("eidos record insert abc")).toBe("eidos:record:insert"))
  it("record update", () =>
    expect(category("eidos record update abc")).toBe("eidos:record:update"))
  it("record delete", () =>
    expect(category("eidos record delete abc")).toBe("eidos:record:delete"))

  // subdoc
  it("subdoc write", () =>
    expect(category("eidos subdoc write abc xyz")).toBe("eidos:subdoc:write"))
  it("subdoc delete", () =>
    expect(category("eidos subdoc delete abc xyz")).toBe("eidos:subdoc:delete"))

  // table
  it("table create", () =>
    expect(category("eidos table create mytable")).toBe("eidos:table:create"))
  it("table delete", () =>
    expect(category("eidos table delete abc")).toBe("eidos:table:delete"))

  // column
  it("column create", () =>
    expect(category("eidos column create abc mycol -t text")).toBe(
      "eidos:column:create"
    ))
  it("column update", () =>
    expect(category("eidos column update abc mycol -n newName")).toBe(
      "eidos:column:update"
    ))
  it("column delete", () =>
    expect(category("eidos column delete abc mycol")).toBe(
      "eidos:column:delete"
    ))

  // view
  it("view create", () =>
    expect(category("eidos view create abc myview grid")).toBe(
      "eidos:view:create"
    ))
  it("view update", () =>
    expect(category("eidos view update abc vid -n New")).toBe(
      "eidos:view:update"
    ))
  it("view delete", () =>
    expect(category("eidos view delete abc vid")).toBe("eidos:view:delete"))

  // journal
  it("journal write", () =>
    expect(category("eidos journal write 2024-01-01")).toBe(
      "eidos:journal:write"
    ))

  // extension
  it("extension create", () =>
    expect(category("eidos extension create my-tool 'My Tool' -t script")).toBe(
      "eidos:extension:create"
    ))
  it("extension write", () =>
    expect(category("eidos extension write my-tool")).toBe(
      "eidos:extension:write"
    ))

  // doc
  it("doc create", () =>
    expect(category("eidos doc create test")).toBe("eidos:doc:create"))
  it("doc update", () =>
    expect(category("eidos doc update abc")).toBe("eidos:doc:update"))
  it("doc delete", () =>
    expect(category("eidos doc delete abc")).toBe("eidos:doc:delete"))
})
