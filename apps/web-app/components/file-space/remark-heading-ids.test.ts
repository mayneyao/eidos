// @vitest-environment node

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"

import { remarkHeadingIds } from "./remark-heading-ids"

interface TestNode {
  type: string
  value?: string
  children?: TestNode[]
  data?: { hProperties?: Record<string, unknown> }
}

describe("Markdown heading IDs", () => {
  it("assigns Unicode IDs and suffixes duplicate headings", () => {
    const tree: TestNode = {
      type: "root",
      children: [
        { type: "heading", children: [{ type: "text", value: "下一步 计划" }] },
        {
          type: "heading",
          children: [
            {
              type: "link",
              children: [{ type: "text", value: "下一步 计划" }],
            },
          ],
        },
      ],
    }

    remarkHeadingIds()(tree)

    expect(tree.children?.[0].data).toEqual({
      hProperties: { id: "下一步-计划" },
    })
    expect(tree.children?.[1].data).toEqual({
      hProperties: { id: "下一步-计划-1" },
    })
  })

  it("renders heading IDs into HTML", () => {
    const html = renderToStaticMarkup(
      createElement(ReactMarkdown, {
        children: "# 下一步 计划\n\n# 下一步 计划",
        remarkPlugins: [remarkHeadingIds],
      })
    )

    expect(html).toContain('id="下一步-计划"')
    expect(html).toContain('id="下一步-计划-1"')
  })
})
