import { describe, it } from "vitest"
import { markdown2lexical } from "./headless"
import { reconcileState } from "./utils/state-reconciliation"

async function analyzeCase(name: string, oldMd: string, newMd: string) {
  const oldStateStr = await markdown2lexical(oldMd, [], [], {
    useHarness: true,
  })
  const oldState = JSON.parse(oldStateStr)

  const intermediateStr = await markdown2lexical(newMd, [], [], {
    useHarness: false,
  })
  const intermediateState = JSON.parse(intermediateStr)

  const newState = reconcileState(oldState, intermediateState)

  function collectNodes(
    state: any,
    path = "root"
  ): Array<{ path: string; type: string; text?: string; pid?: string }> {
    const results: Array<{
      path: string
      type: string
      text?: string
      pid?: string
    }> = []
    function traverse(node: any, p: string) {
      const info: any = { path: p, type: node.type }
      if (node.text) info.text = node.text
      if (node.$?.pid) info.pid = node.$.pid.slice(0, 16) + "..."
      results.push(info)
      if (node.children) {
        node.children.forEach((child: any, i: number) =>
          traverse(child, `${p}.children[${i}]`)
        )
      }
    }
    traverse(state.root, "root")
    return results
  }

  const oldNodes = collectNodes(oldState)
  const newNodes = collectNodes(newState)

  console.log(`\n=== ${name} ===`)
  console.log("\nOLD NODES:")
  oldNodes.forEach((n) =>
    console.log(
      `  ${n.path}: ${n.type} ${n.text ? `"${n.text.slice(0, 30)}"` : ""} ${n.pid || ""}`
    )
  )
  console.log("\nNEW NODES:")
  newNodes.forEach((n) =>
    console.log(
      `  ${n.path}: ${n.type} ${n.text ? `"${n.text.slice(0, 30)}"` : ""} ${n.pid || ""}`
    )
  )

  // Check preservation
  const oldPids = new Set(oldNodes.filter((n) => n.pid).map((n) => n.pid))
  const newPidSet = new Set(newNodes.filter((n) => n.pid).map((n) => n.pid))

  let lost = 0
  for (const pid of oldPids) {
    if (!newPidSet.has(pid)) {
      lost++
      const lostNode = oldNodes.find((n) => n.pid === pid)
      console.log(
        `\n  LOST: ${lostNode?.path} ${lostNode?.type} "${lostNode?.text?.slice(0, 30)}"`
      )
    }
  }
  console.log(`\n  Summary: ${oldPids.size - lost}/${oldPids.size} preserved`)
}

describe("Debug remaining failures", () => {
  it("case-06-delete-beginning", async () => {
    await analyzeCase(
      "case-06-delete-beginning",
      `# Document\n\n**Paragraph to be deleted**\n\nFirst kept paragraph.\n\nSecond kept paragraph.`,
      `# Document\n\nFirst kept paragraph.\n\nSecond kept paragraph.`
    )
  })

  it("case-17-ordered-list-insert", async () => {
    await analyzeCase(
      "case-17-ordered-list-insert",
      `## 试一试\n\n1. 在 Markdown 编辑器中修改这段文字\n2. 观察右侧 State Tree 中的 PID 变化\n3. 你会发现已有段落的 ID 被保留了！`,
      `## 试一试\n\n1. 在 Markdown 编辑器中修改这段文字\n   1.5 新增的步骤\n2. 观察右侧 State Tree 中的 PID 变化\n3. 你会发现已有段落的 ID 被保留了！`
    )
  })

  it("case-68-heading-to-paragraph", async () => {
    await analyzeCase("case-68-heading-to-paragraph", `## Heading`, `Heading`)
  })
})
