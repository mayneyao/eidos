import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { TextNode } from "lexical"

export interface Command {
  name: string
  description: string
  parameters?: Array<{
    name: string
    type: "string" | "number"
    required?: boolean
  }>
  execute: (args: string[]) => void
}

export const commands: Command[] = [
  {
    name: "help",
    description: "显示所有可用命令",
    execute: () => {
      console.log("显示帮助信息")
    },
  },
  {
    name: "ping",
    description: "测试延迟",
    execute: () => {
      console.log("pong!")
    },
  },
]

export function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const removeTransform = editor.registerNodeTransform(
      TextNode,
      (textNode) => {
        const text = textNode.getTextContent()

        if (text.startsWith("/")) {
          const [command, ...args] = text.slice(1).split(" ")
          const foundCommand = commands.find((cmd) => cmd.name === command)

          if (foundCommand) {
            foundCommand.execute(args)
          }
        }
      }
    )

    return () => {
      removeTransform()
    }
  }, [editor])

  return null
}
