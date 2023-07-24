import { IAction } from "@/worker/meta_table/action"

import { ActionExecutor } from "./action"

describe("ActionExecutor", () => {
  const action: IAction = {
    id: "test_id",
    name: "test",
    params: [
      {
        name: "content",
        type: "string",
      },
    ],
    nodes: [
      {
        name: "addRow",
        params: [
          {
            name: "tableName",
            value: "todos",
          },
          {
            name: "data",
            value: {
              title: "{{content}}",
            },
          },
        ],
      },
    ],
  }
  test("getParams", async () => {
    const executor = new ActionExecutor(action)
    const params = executor.getParams("/test --content=123 --name=1")
    expect(params).toEqual({ content: "123", name: "1" })
  })
  test("execute", async () => {
    const executor = new ActionExecutor(action)
    const res = executor.execute("/test --content=123")
  })
})
