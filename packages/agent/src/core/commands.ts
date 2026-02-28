import type { PlatformAdapter, Message } from "../types/index.js"
import type { SessionManager } from "../agent/session-manager.js"

/**
 * Register common commands for any platform
 * This is platform-agnostic
 */
export function registerCommonCommands(
  adapter: PlatformAdapter,
  sessionManager: SessionManager,
  config: {
    modelName?: string
  } = {}
): void {
  // Start command
  adapter.onCommand("start", async (message: Message) => {
    const userName = message.firstName || "there"
    await adapter.sendMessage(
      message.userId,
      `👋 你好 ${userName}！欢迎使用 Eidos AI Agent。\n\n` +
        `我是一个集成在 Eidos 中的 AI 助手，可以帮助你管理空间和文件。\n\n` +
        `可用命令：\n` +
        `/help - 显示帮助信息\n` +
        `/reset - 清空对话历史\n` +
        `/stats - 查看会话统计\n` +
        `/space - 管理空间\n\n` +
        `直接发送消息即可开始对话！`
    )
  })

  // Help command
  adapter.onCommand("help", async (message: Message) => {
    await adapter.sendMessage(
      message.userId,
      `🤖 Eidos AI Agent 帮助\n\n` +
        `我是集成在 Eidos 中的 AI 助手，可以帮助你管理空间和文件。\n\n` +
        `📋 基本命令：\n` +
        `/start - 启动机器人\n` +
        `/help - 显示此帮助信息\n` +
        `/reset - 清空对话历史\n` +
        `/stats - 查看会话统计\n\n` +
        `📁 空间命令：\n` +
        `/space - 显示当前空间\n` +
        `/space list - 列出所有空间\n` +
        `/space switch <space_id> - 切换空间\n` +
        `/spaces - 列出所有空间（快捷方式）\n\n` +
        `💡 提示：\n` +
        `• 直接发送消息即可开始对话\n` +
        `• 使用 AI 工具可以读写空间中的文件\n` +
        `• 使用 /space switch 选择空间后，AI 可以帮你管理文件\n` +
        `• 如果遇到问题，尝试 /reset`
    )
  })

  // Reset command
  adapter.onCommand("reset", async (message: Message) => {
    const success = sessionManager.resetSession(message.userId)
    if (success) {
      await adapter.sendMessage(
        message.userId,
        "🔄 对话历史已清空！让我们重新开始。\n\n发送消息开始新的对话。"
      )
    } else {
      await adapter.sendMessage(
        message.userId,
        "✨ 没有找到对话历史。这是一个全新的开始！\n\n发送消息开始对话。"
      )
    }
  })

  // Stats command
  adapter.onCommand("stats", async (message: Message) => {
    const sessionInfo = sessionManager.getSessionInfo(message.userId)
    const totalSessions = sessionManager.getActiveSessionCount()
    const currentSpace = sessionManager.getCurrentSpace(message.userId)

    let spaceInfo = ""
    if (currentSpace) {
      spaceInfo = `\n当前空间: ${currentSpace.name} (${currentSpace.id})`
    }

    if (sessionInfo) {
      const inactiveMinutes = Math.floor(
        (Date.now() - sessionInfo.lastActivity) / 60000
      )
      await adapter.sendMessage(
        message.userId,
        `📊 会话统计\n\n` +
          `消息数: ${sessionInfo.messageCount}\n` +
          `最后活跃: ${inactiveMinutes} 分钟前\n` +
          `活跃会话总数: ${totalSessions}${spaceInfo}\n\n` +
          `模型: ${config.modelName || "default"}`
      )
    } else {
      await adapter.sendMessage(
        message.userId,
        `📊 未找到活跃会话。\n\n` +
          `活跃会话总数: ${totalSessions}${spaceInfo}\n\n` +
          `发送消息开始新的会话！`
      )
    }
  })

  console.log("📝 Registered common commands: /start, /help, /reset, /stats")
}
