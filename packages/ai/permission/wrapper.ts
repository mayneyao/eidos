import type { Tool } from "ai"

export type RequirePermissionFn = (
  input: any
) => boolean | string | { required: boolean; reason?: string; key?: string }

export interface PermissionServerLike {
  requestPermission(params: {
    sessionId: string
    toolName: string
    toolCallId: string
    input: any
    cacheKey?: string
  }): Promise<{ approved: boolean; reason?: string }>
}

export interface WithPermissionOptions {
  toolName: string
  sessionId: string
  permissionServer: PermissionServerLike
  requiresPermission?: RequirePermissionFn
}

export function withPermission<T extends Tool>(
  tool: T,
  options: WithPermissionOptions
): T {
  const { toolName, sessionId, permissionServer, requiresPermission } = options

  const originalExecute = tool.execute as
    | ((input: any, options?: any) => Promise<any>)
    | undefined

  const wrappedExecute = originalExecute
    ? async (input: any, execOptions?: any) => {
        const check = requiresPermission ? requiresPermission(input) : true

        if (check === false) {
          return originalExecute(input, execOptions)
        }

        if (typeof check === "object" && !check.required) {
          return originalExecute(input, execOptions)
        }

        const cacheKey =
          typeof check === "string"
            ? check
            : typeof check === "object" && check.key
              ? check.key
              : undefined

        const toolCallId = execOptions?.toolCallId
        if (!toolCallId) {
          return originalExecute(input, execOptions)
        }

        const result = await permissionServer.requestPermission({
          sessionId,
          toolName,
          toolCallId,
          input,
          cacheKey,
        })

        if (!result.approved) {
          const msg = result.reason ?? "User denied this operation."
          return { error: `[Denied] ${msg}` }
        }

        return originalExecute(input, execOptions)
      }
    : undefined

  return {
    ...tool,
    execute: wrappedExecute,
  } as T
}
