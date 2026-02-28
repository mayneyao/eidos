/**
 * REPL Tools for Agent
 * Allows the agent to execute JavaScript code in the Eidos browser sandbox
 */

import { Type } from "@sinclair/typebox"
import type { AgentTool } from "@mariozechner/pi-agent-core"

/**
 * REPL runtime configuration
 */
export interface ReplToolsConfig {
  /** 
   * Execute JavaScript code in the renderer and return the result.
   * This should handle the IPC communication internally.
   */
  executeInRenderer: (code: string) => Promise<any>
  /**
   * Save code to a file in the space
   */
  saveScript: (path: string, content: string) => Promise<void>
}

const ExecuteJsSchema = Type.Object({
  code: Type.String({
    description: "The JavaScript code to execute. Can be multi-line and use await. Access 'eidos', 'database', and 'repl' directly.",
  }),
  save_as: Type.Optional(Type.String({
    description: "Optional: Save this code to a file in '.eidos/scripts/' for future use (e.g., 'cleanup-data.js').",
  })),
})

const RunScriptSchema = Type.Object({
  filename: Type.String({
    description: "The name of the script to run from '.eidos/scripts/' (e.g., 'hello.js').",
  }),
})

const ListScriptsSchema = Type.Object({})

/**
 * Create REPL tools for the agent
 */
export function createReplTools(config: ReplToolsConfig): AgentTool<any>[] {
  const { executeInRenderer, saveScript } = config

  // Tool: Execute JS code in Eidos sandbox
  const executeJsTool: AgentTool<typeof ExecuteJsSchema> = {
    name: "execute_js_code",
    label: "Execute JavaScript",
    description: `Execute JavaScript code in the Eidos browser sandbox.

IMPORTANT:
- You MUST use 'return' to return any result to the agent.
- You MUST use 'await' for any asynchronous Eidos SDK calls.
- Example: 'return await eidos.currentSpace.schema.listTables()'
- Available Globals: eidos (SDK), database (Space ID), repl (save/load/ls helpers).`,
    parameters: ExecuteJsSchema,
    execute: async (toolCallId, params) => {
      const { code, save_as } = params

      if (save_as) {
        try {
          await saveScript(save_as, code)
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `⚠️ Failed to save script to ${save_as}: ${error.message}` }],
            details: { error: error.message }
          }
        }
      }

      try {
        const result = await executeInRenderer(code)
        console.log(`[Agent REPL] Execute JS result:`, JSON.stringify(result, null, 2))
        let resultText = ""
        
        if (result && result.error) {
          // Handle structured error from sandbox
          const errorInfo = typeof result.error === 'object' ? result.error : { message: result.error }
          const errorMsg = errorInfo.message || String(result.error)
          const errorStack = errorInfo.stack || ''
          const errorName = errorInfo.name || 'Error'
          
          resultText = `❌ Execution Error: ${errorName}: ${errorMsg}`
          if (errorStack) {
            resultText += `\n\nStack trace:\n${errorStack}`
          }
        } else {
          resultText = `✅ Execution Successful.\n\nResult:\n${JSON.stringify(result, null, 2)}`
        }

        if (save_as) {
          resultText = `💾 Script saved to ${save_as}\n${resultText}`
        }

        return {
          content: [{ type: "text", text: resultText }],
          details: result,
        }
      } catch (error: any) {
        // Handle error from IPC/bridge
        console.error(`[Agent REPL] Execute JS error:`, error)
        const errorDetails = error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : { message: String(error) }
        
        const errorMsg = errorDetails.message || String(error)
        const errorStack = errorDetails.stack || ''
        
        let resultText = `❌ Failed: ${errorMsg}. Make sure the Eidos app window is active and a space is selected.`
        if (errorStack) {
          resultText += `\n\nStack trace:\n${errorStack}`
        }
        
        return {
          content: [{ type: "text", text: resultText }],
          details: { error: errorDetails }
        }
      }
    },
  }

  // Tool: Run a saved script
  const runScriptTool: AgentTool<typeof RunScriptSchema> = {
    name: "run_saved_script",
    label: "Run Saved Script",
    description: "Run a previously saved JavaScript script from the '.eidos/scripts/' directory.",
    parameters: RunScriptSchema,
    execute: async (toolCallId, params) => {
      const { filename } = params
      const code = `return await repl.load("${filename}")`
      
      try {
        const scriptContent = await executeInRenderer(code)
        console.log(`[Agent REPL] Load script "${filename}" result:`, JSON.stringify(scriptContent, null, 2))
        if (scriptContent && scriptContent.error) {
           // Handle structured error object
           const errorInfo = typeof scriptContent.error === 'object' ? scriptContent.error : { message: scriptContent.error }
           const errorMsg = errorInfo.message || String(scriptContent.error)
           const errorName = errorInfo.name || 'Error'
           const errorStack = errorInfo.stack || ''
           
           let resultText = `❌ Failed to load script "${filename}": ${errorName}: ${errorMsg}`
           if (errorStack) {
             resultText += `\n\nStack trace:\n${errorStack}`
           }
           
           return { 
             content: [{ type: "text", text: resultText }],
             details: { error: errorInfo }
           }
        }
        
        // Execute the loaded content
        const result = await executeInRenderer(scriptContent)
        console.log(`[Agent REPL] Execute script "${filename}" result:`, JSON.stringify(result, null, 2))
        return {
          content: [{ type: "text", text: `✅ Script "${filename}" executed successfully.\n\nResult:\n${JSON.stringify(result, null, 2)}` }],
          details: result || {}
        }
      } catch (error: any) {
        console.error(`[Agent REPL] Run script "${filename}" error:`, error)
        return { 
          content: [{ type: "text", text: `❌ Failed to run script "${filename}": ${error.message}` }],
          details: { error: error.message }
        }
      }
    }
  }

  // Tool: List all saved scripts
  const listScriptsTool: AgentTool<typeof ListScriptsSchema> = {
    name: "list_scripts",
    label: "List Scripts",
    description: "List all JavaScript scripts saved in the '.eidos/scripts/' directory.",
    parameters: ListScriptsSchema,
    execute: async (toolCallId, params) => {
      try {
        const result = await executeInRenderer("return await repl.ls()")
        console.log(`[Agent REPL] List scripts result:`, JSON.stringify(result, null, 2))
        if (result && result.error) {
           // Handle structured error object
           const errorInfo = typeof result.error === 'object' ? result.error : { message: result.error }
           const errorMsg = errorInfo.message || String(result.error)
           const errorName = errorInfo.name || 'Error'
           const errorStack = errorInfo.stack || ''
           
           let resultText = `❌ Failed to list scripts: ${errorName}: ${errorMsg}`
           if (errorStack) {
             resultText += `\n\nStack trace:\n${errorStack}`
           }
           
           return { 
             content: [{ type: "text", text: resultText }],
             details: { error: errorInfo }
           }
        }
        
        const files = Array.isArray(result) ? result : []
        const list = files.map(f => `- ${f}`).join("\n")
        return {
          content: [{ type: "text", text: files.length > 0 ? `Saved scripts:\n${list}` : "No scripts found in '.eidos/scripts/'." }],
          details: { scripts: files }
        }
      } catch (error: any) {
        return { 
          content: [{ type: "text", text: `❌ Failed to list scripts: ${error.message}` }],
          details: { error: error.message }
        }
      }
    }
  }

  return [executeJsTool, runScriptTool, listScriptsTool]
}
