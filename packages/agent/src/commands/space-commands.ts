import type {
  PlatformAdapter,
  SpaceManagerInterface,
} from "../types/index.js"
import type { SessionManager } from "../agent/session-manager.js"

/**
 * Register space-related commands
 */
export function registerSpaceCommands(
  platform: PlatformAdapter,
  sessionManager: SessionManager,
  spaceManager: SpaceManagerInterface
): void {
  // Command: /space - Show current space or list spaces
  platform.onCommand("space", async (message, args) => {
    const userId = message.userId

    // If no args, show current space status
    if (!args || args.length === 0) {
      const currentSpace = sessionManager.getCurrentSpace(userId)

      if (currentSpace) {
        await platform.sendMessage(
          userId,
          `📁 Current space: **${currentSpace.name}**\n` +
            `ID: \`${currentSpace.id}\`\n` +
            `Path: \`${currentSpace.path}\`\n\n` +
            `Use \`/space list\` to see all spaces\n` +
            `Use \`/space switch <space_id>\` to change space`
        )
      } else {
        const spaces = spaceManager.getAllSpaces()
        if (spaces.length === 0) {
          await platform.sendMessage(
            userId,
            "❌ No spaces available. Please create a space in Eidos first."
          )
        } else {
          const spaceList = spaces
            .map((s) => `• ${s.name} (\`${s.id}\`)`)
            .join("\n")
          await platform.sendMessage(
            userId,
            `📁 No space selected.\n\n` +
              `Available spaces:\n${spaceList}\n\n` +
              `Use \`/space switch <space_id>\` to select a space`
          )
        }
      }
      return
    }

    const subCommand = args[0].toLowerCase()

    switch (subCommand) {
      case "list":
      case "ls": {
        const spaces = spaceManager.getAllSpaces()
        if (spaces.length === 0) {
          await platform.sendMessage(
            userId,
            "❌ No spaces available. Please create a space in Eidos first."
          )
          return
        }

        const currentSpace = sessionManager.getCurrentSpace(userId)
        const spaceList = spaces
          .map((s) => {
            const marker = currentSpace?.id === s.id ? " ✅" : ""
            return `• ${s.name} (\`${s.id}\`)${marker}`
          })
          .join("\n")

        await platform.sendMessage(
          userId,
          `📁 Available spaces (${spaces.length}):\n\n${spaceList}\n\n` +
            `Use \`/space switch <space_id>\` to change space`
        )
        break
      }

      case "switch":
      case "use": {
        const spaceId = args[1]
        if (!spaceId) {
          await platform.sendMessage(
            userId,
            "❌ Please specify a space ID.\nUsage: `/space switch <space_id>`"
          )
          return
        }

        const space = spaceManager.getSpace(spaceId)
        if (!space) {
          await platform.sendMessage(
            userId,
            `❌ Space not found: \`${spaceId}\`\n` +
              `Use \`/space list\` to see available spaces.`
          )
          return
        }

        const success = sessionManager.switchSpace(userId, spaceId, {
          username: message.username,
          firstName: message.firstName,
        })
        if (success) {
          await platform.sendMessage(
            userId,
            `✅ Switched to space: **${space.name}**\n` +
              `ID: \`${space.id}\`\n` +
              `Path: \`${space.path}\`\n\n` +
              `You can now use file operations in this space.`
          )
        } else {
          await platform.sendMessage(
            userId,
            `❌ Failed to switch to space: \`${spaceId}\``
          )
        }
        break
      }

      case "current":
      case "info": {
        const currentSpace = sessionManager.getCurrentSpace(userId)
        if (currentSpace) {
          await platform.sendMessage(
            userId,
            `📁 Current space: **${currentSpace.name}**\n` +
              `ID: \`${currentSpace.id}\`\n` +
              `Path: \`${currentSpace.path}\``
          )
        } else {
          await platform.sendMessage(
            userId,
            "📁 No space is currently selected.\n" +
              "Use `/space list` to see available spaces."
          )
        }
        break
      }

      default:
        await platform.sendMessage(
          userId,
          `❓ Unknown command: \`${subCommand}\`\n\n` +
            `Available commands:\n` +
            `• \`/space\` - Show current space\n` +
            `• \`/space list\` - List all spaces\n` +
            `• \`/space switch <space_id>\` - Switch to a space\n` +
            `• \`/space current\` - Show current space info`
        )
    }
  })

  // Command: /spaces - Alias for /space list
  platform.onCommand("spaces", async (message) => {
    const userId = message.userId
    const spaces = spaceManager.getAllSpaces()

    if (spaces.length === 0) {
      await platform.sendMessage(
        userId,
        "❌ No spaces available. Please create a space in Eidos first."
      )
      return
    }

    const currentSpace = sessionManager.getCurrentSpace(userId)
    const spaceList = spaces
      .map((s) => {
        const marker = currentSpace?.id === s.id ? " ✅" : ""
        return `• ${s.name} (\`${s.id}\`)${marker}`
      })
      .join("\n")

    await platform.sendMessage(
      userId,
      `📁 Available spaces (${spaces.length}):\n\n${spaceList}\n\n` +
        `Use \`/space switch <space_id>\` to change space`
    )
  })

  console.log("📝 Registered space commands: /space, /spaces")
}
