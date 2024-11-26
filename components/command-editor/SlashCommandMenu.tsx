import { useEffect, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

import { Command, commands } from "./SlashCommandPlugin"

export function SlashCommandMenu() {
  const [editor] = useLexicalComposerContext()
  const [showMenu, setShowMenu] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [suggestions, setSuggestions] = useState<Command[]>([])

  useEffect(() => {
    const removeListener = editor.registerTextContentListener((text) => {
      if (text.startsWith("/")) {
        setShowMenu(true)
        const searchQuery = text.slice(1)
        setSearchText(searchQuery)

        // 过滤匹配的命令
        const filtered = commands.filter((cmd) =>
          cmd.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        setSuggestions(filtered)
      } else {
        setShowMenu(false)
      }
    })

    return () => {
      removeListener()
    }
  }, [editor])

  if (!showMenu) {
    return null
  }

  return (
    <div className="slash-command-menu">
      {suggestions.map((command) => (
        <div key={command.name} className="command-item">
          <span className="command-name">/{command.name}</span>
          <span className="command-description">{command.description}</span>
        </div>
      ))}
    </div>
  )
}
