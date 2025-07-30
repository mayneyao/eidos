import { openCursor } from "@/lib/web/scheme"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { usePlayground } from "@/apps/desktop/renderer/hooks/usePlayground"

interface UseOpenInPlaygroundProps {
  onPlaygroundChange: (filename: string, content: string, space: string, blockId: string) => void
}

export const useOpenInPlayground = ({ onPlaygroundChange }: UseOpenInPlaygroundProps) => {
  const { space } = useCurrentPathInfo()
  const { sqlite } = useSqlite()

  const { initializePlayground } = usePlayground({
    onChange: onPlaygroundChange,
  })

  const openInPlayground = async (docId: string, filename?: string) => {
    try {
      const markdown = await sqlite?.getDocMarkdown(docId)
      if (!markdown) {
        console.error("Failed to export markdown for document")
        return
      }

      const path = await initializePlayground(space, docId, [
        {
          name: filename || `${docId}.md`,
          content: markdown,
        },
      ])

      if (path) {
        const url = openCursor(path)
        window.open(url, "_blank")
      }
    } catch (error) {
      console.error("Failed to open document in playground:", error)
    }
  }

  return {
    openInPlayground,
  }
} 