import { useEffect } from 'react'
import { useCurrentPathInfo } from '../hooks/use-current-pathinfo'
import { useAppRuntimeStore } from '../store/runtime-store'
import { callJavaScript } from './script-container/helper'

/**
 * AgentBridge handles IPC messages from the Electron main process 
 * to execute JavaScript code in the sandbox iframe.
 * 
 * It is mounted globally in the DatabaseLayout to ensure the Agent 
 * can always interact with the Eidos browser environment.
 */
export const AgentBridge = () => {
  const { space } = useCurrentPathInfo()
  const { scriptContainerRef } = useAppRuntimeStore()

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).eidos?.on) {
      const eidos = (window as any).eidos
      
      const listenerId = eidos.on('agent-execute-code', async (event: any, data: { code: string, requestId: string }) => {
        const { code, requestId } = data
        console.log(`[AgentBridge] Received request ${requestId}`)
        console.log(`[AgentBridge] Raw code:\n${code}`)
        
        let processedCode = code.trim()
        
        // Auto-return for simple expressions to improve agent success rate
        if (!processedCode.includes('\n') && !processedCode.includes(';') && !processedCode.includes('return ')) {
          // Rudimentary check to avoid wrapping statements like 'const a = 1'
          if (!/^(const|let|var|if|for|while|switch|function|class|try|throw)\b/.test(processedCode)) {
            processedCode = `return (${processedCode})`
            console.log(`[AgentBridge] Wrapped with return: ${processedCode}`)
          }
        }

        console.log(`[AgentBridge] Processed code (${requestId}):\n${processedCode}`)
        
        if (!space || !scriptContainerRef || !scriptContainerRef.current) {
          console.error("AgentBridge: Sandbox not ready or space not selected", { space, ref: !!scriptContainerRef?.current })
          if (eidos.send) {
            eidos.send(`agent-execute-result-${requestId}`, { error: "Sandbox not ready" })
          }
          return
        }

        try {
          console.log(`[AgentBridge] Calling callJavaScript for ${requestId}...`)
          let result = await callJavaScript({
            input: {},
            code: processedCode,
            id: 'agent-session',
            command: 'run',
            context: {
              database: space,
            },
            space: space,
            hash: String(Date.now())
          }, scriptContainerRef as any)
          
          console.log(`[AgentBridge] callJavaScript returned for ${requestId}`)
          console.log(`[AgentBridge] Raw result type: ${typeof result}`)
          console.log(`[AgentBridge] Raw result:`, JSON.stringify(result, null, 2).substring(0, 2000))

          // 如果用户代码返回 Error 对象，转换为可序列化的对象
          if (result instanceof Error) {
            console.log(`[AgentBridge] Result is Error instance, converting...`)
            result = {
              error: {
                name: result.name,
                message: result.message,
                stack: result.stack
              }
            }
          }
          
          // 检查 SDK 返回的错误格式: { success: false, error: "xxx" }
          if (result && result.success === false && result.error) {
            console.log(`[AgentBridge] Detected SDK error format:`, result.error)
            // 转换为错误格式，让 agent 能正确识别
            result = {
              error: {
                name: 'SDKError',
                message: typeof result.error === 'string' ? result.error : JSON.stringify(result.error),
                stack: result.stack || ''
              }
            }
          }

          console.log(`[AgentBridge] Sending result for ${requestId}:`, JSON.stringify(result, null, 2).substring(0, 1000))
          if (eidos.send) {
            eidos.send(`agent-execute-result-${requestId}`, result)
          }
        } catch (error: any) {
          console.error(`[AgentBridge] Execution error for ${requestId}:`, error)
          if (eidos.send) {
            const errorDetails = error instanceof Error ? {
              name: error.name,
              message: error.message,
              stack: error.stack
            } : { message: String(error) }
            console.log(`[AgentBridge] Sending error details for ${requestId}:`, errorDetails)
            eidos.send(`agent-execute-result-${requestId}`, { error: errorDetails })
          }
        }
      })

      return () => {
        if (eidos.off) {
          eidos.off('agent-execute-code', listenerId)
        }
      }
    }
  }, [space, scriptContainerRef])

  return null
}
