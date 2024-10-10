import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { useTheme } from "next-themes"

interface MermaidRendererProps {
  text: string
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({ text }) => {
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string>("")
  const { theme } = useTheme()
  const mermaidRef = useRef<HTMLDivElement>(null)
  const [isMermaidInitialized, setIsMermaidInitialized] = useState(false)

  useEffect(() => {
    const initializeMermaid = () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "dark" ? "dark" : "default",
        })
      } catch (error) {
        // Mermaid is already initialized, ignore the error
      }
      setIsMermaidInitialized(true)
    }

    initializeMermaid()
  }, [theme])

  useEffect(() => {
    const renderMermaid = async () => {
      if (!isMermaidInitialized) return

      try {
        const mermaidId = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const isValid = await mermaid.parse(text)
        if (isValid) {
          const { svg } = await mermaid.render(mermaidId, text)
          setSvg(svg)
          setError("")
        } else {
          setSvg("")
          setError("Invalid Mermaid text")
        }
      } catch (error) {
        setSvg("")
        setError("Invalid Mermaid text")
      }
    }

    renderMermaid()
  }, [text, isMermaidInitialized])

  return (
    <div>
      {error && <div className="text-red-500">{error}</div>}
      <div
        ref={mermaidRef}
        className="p-2 flex items-center justify-center"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )
}

export default MermaidRenderer
