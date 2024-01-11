import { IAction } from "@/worker/web-worker/meta_table/action"

export class ActionExecutor {
  functionMap: Record<string, Function> = {
    addRow: (args: Record<string, any>) => {
      console.log("addRow", args)
    },
  }
  contextParamsMap: Record<string, any>
  constructor(private action: IAction) {
    const contextParamsMap: Record<string, any> = {}
    this.action.params.forEach((param) => {
      contextParamsMap[param.name] = param
    })
    this.contextParamsMap = contextParamsMap
  }

  /**
   * turn "/todo --content=123 --name=456" to {content: 123, name: 456}
   * @param cmd "/todo --content=123 --name=456"
   */
  static getParams(cmd: string) {
    const params: Record<string, any> = {}
    const regx = /--(\w+)=(\S+)/g
    let match = regx.exec(cmd)
    while (match) {
      params[match[1]] = match[2]
      match = regx.exec(cmd)
    }
    return params
  }

  getArg(param: { name: string; value: any }, realParams: Record<string, any>) {
    // {{content}} => realParams.content
    const regx = /{{(\w+)}}/g
    if (typeof param.value === "string") {
      const match = regx.exec(param.value)
      if (match) {
        const name = match[1]
        const value = realParams[name]
        const contextParam = this.contextParamsMap[name]
        if (contextParam.type === "number") {
          return Number(value)
        } else if (contextParam.type === "boolean") {
          Boolean(value)
        } else {
          return value
        }
      }
      return param.value
    } else if (typeof param.value === "number") {
      return Number(param.value)
    } else if (typeof param.value === "boolean") {
      return Boolean(param.value)
    } else if (typeof param.value === "object") {
      const res: Record<string, any> = {}
      Object.keys(param.value).forEach((key) => {
        res[key] = this.getArg(
          {
            name: key,
            value: param.value[key],
          },
          realParams
        )
      })
      return res
    } else {
      return param.value
    }
  }

  getArgs(
    params: { name: string; value: string }[],
    realParams: Record<string, any>
  ) {
    const args: Record<string, any> = {}

    for (const param of params) {
      args[param.name] = this.getArg(param, realParams)
    }
    return args
  }

  async execute(cmd: string) {
    const realParams: Record<string, any> = ActionExecutor.getParams(cmd)
    const results = []
    for (const node of this.action.nodes) {
      const func = this.functionMap[node.name]
      const args: Record<string, any> = this.getArgs(node.params, realParams)
      console.log("execute", func, args)
      const res = func(args)
      results.push(res)
    }
  }
}
