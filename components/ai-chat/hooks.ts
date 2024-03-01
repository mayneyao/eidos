import { useEffect, useMemo, useRef, useState } from "react"

import { getPrompt } from "@/lib/ai/openai"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useUiColumns } from "@/hooks/use-ui-columns"

export const sysPrompts = {
  base: ``,
  eidosBaseHelper: `you must abide by the following rules:
- data from query which can be trusted, you can display it directly, don't need to check it.
`,
  eidosActionCreator: `now you are a action creator, you can create action.
- user just know name of table and name of column, don't know tableName and tableColumnName
- tableName and tableColumnName are actually exist in sqlite database. you will use them to query database.
- tableColumnName will be mapped, such as 'title : cl_a4ef', title is name of column, cl_a4ef is tableColumnName, you will use cl_a4ef to query database. otherwise you will be punished.
- data from query which can be trusted, you can display it directly, don't need to check it.

1. an action is a function, it can be called by user.
2. function has name, params and nodes
2.1 name is name of function, it can be called by user.
2.2 params is parameters of function, it can be used in nodes.
2.3 nodes is a list of node, it can be used to do something. node has name and params,every node is a function-call
3. build-in function-call below:
- addRow: add a row to table, has two params: tableName and data. data is a object, it's key is tableColumnName, it's value is data from user.

example:
q: 我想创建一个 todo 的 action, 它有一个 content 参数，我想把它保存到 todos 表的 title 字段中
a: {
  name: todo,
  params: [
    {
      name: content,
      type: string,
    }
  ],
  nodes: [
    {
      name: addRow,
      params: [
        {
          name: tableName,
          value: tb_f1ab6a737f5a4c059aeb106f8ea5a79d
        },
        {
          name: data
          value: {
            title: '{{content}}'
          }
        }
      ]
    }
  ]
}
`,
}

const usePromptContext = () => {
  const { space: database, tableName } = useCurrentPathInfo()
  const [currentDocMarkdown, setCurrentDocMarkdown] = useState("")
  const { uiColumns } = useUiColumns(tableName || "", database)

  const context = {
    tableName,
    uiColumns,
    databaseName: database,
    currentDocMarkdown,
  }
  return {
    setCurrentDocMarkdown,
    context,
  }
}

export const useSystemPrompt = (currentSysPrompt: keyof typeof sysPrompts) => {
  const { context, setCurrentDocMarkdown } = usePromptContext()
  return useMemo(() => {
    const baseSysPrompt = sysPrompts[currentSysPrompt]
    const systemPrompt = getPrompt(
      baseSysPrompt,
      context,
      currentSysPrompt === "base"
    )
    return {
      systemPrompt,
      setCurrentDocMarkdown,
    }
  }, [context, currentSysPrompt, setCurrentDocMarkdown])
}
