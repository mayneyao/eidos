import { useCallback, useEffect, useRef, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import html2canvas from "html2canvas"
import { $getNodeByKey, NodeKey } from "lexical"
import { ChevronDown } from "lucide-react"
import mermaid from "mermaid"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"

import { $isMermaidNode } from "./node"

export interface MermaidProps {
  text: string
  nodeKey: NodeKey
}

export const Mermaid: React.FC<MermaidProps> = ({ text, nodeKey }) => {
  const [mermaidText, setMermaidText] = useState<string>(text)
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [mode, setMode] = useState<"preview" | "edit">("preview")
  const { theme } = useTheme()
  const mermaidRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [isMermaidInitialized, setIsMermaidInitialized] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  const toggleMode = () => {
    const newMode = mode === "preview" ? "edit" : "preview"
    setMode(newMode)
  }

  useEffect(() => {
    mermaid.contentLoaded()
  }, [])

  const [editor] = useLexicalComposerContext()

  const renderMermaid = useCallback(async () => {
    if (!isMermaidInitialized) return

    try {
      const mermaidId = `mermaid-${nodeKey}-${Math.random()
        .toString(36)
        .substr(2, 9)}`
      const isValid = await mermaid.parse(mermaidText)
      if (isValid) {
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (text !== mermaidText && $isMermaidNode(node)) {
            node.setText(mermaidText)
          }
        })
        const { svg } = await mermaid.render(mermaidId, mermaidText)
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
  }, [mermaidText, text, nodeKey, editor, isMermaidInitialized])

  useEffect(() => {
    if (isMermaidInitialized) {
      renderMermaid()
    }
  }, [renderMermaid, isMermaidInitialized])

  const { toast } = useToast()

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setMermaidText(e.target.value)
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation()
      if (e.key === "Escape") {
        setMode("preview")
      }
    },
    []
  )

  const copyContent = useCallback(
    async (format: "png" | "svg" | "text") => {
      if (mermaidRef.current) {
        try {
          if (format === "text") {
            await navigator.clipboard.writeText(mermaidText)
          } else if (format === "svg") {
            const svgText = mermaidRef.current.innerHTML
            await navigator.clipboard.writeText(svgText)
          } else {
            const canvas = await html2canvas(mermaidRef.current)
            canvas.toBlob((blob) => {
              if (blob) {
                const item = new ClipboardItem({ [`image/${format}`]: blob })
                navigator.clipboard.write([item])
              }
            }, `image/${format}`)
          }
          toast({
            title: `Copied as ${format}`,
            description: "Successfully copied the diagram to the clipboard",
          })
        } catch (error) {
          console.error(`Failed to copy as ${format}:`, error)
          toast({
            title: `Failed to copy as ${format}`,
            description: "Failed to copy the diagram to the clipboard",
          })
        }
      }
    },
    [mermaidText]
  )

  const ref = useRef<HTMLDivElement>(null)

  return (
    <div
      className="relative group bg-secondary"
      style={{ minHeight: "200px" }}
      ref={ref}
    >
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
        <Button variant="outline" size="xs" onClick={toggleMode}>
          {mode === "preview" ? "Edit" : "Preview"}
        </Button>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="xs">
              Copy as <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="group-hover:opacity-100"
            container={ref.current!}
          >
            <DropdownMenuItem onClick={() => copyContent("text")}>
              Text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copyContent("png")}>
              PNG
            </DropdownMenuItem>
            {/* <DropdownMenuItem onClick={() => copyContent("svg")}>
              SVG
            </DropdownMenuItem> */}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {mode === "edit" && (
        <Textarea
          ref={textareaRef}
          value={mermaidText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          rows={mermaidText.split("\n").length}
          placeholder="Enter your Mermaid diagram code here..."
        />
      )}
      {error && <div className="text-red-500">{error}</div>}
      <div
        ref={mermaidRef}
        className="p-2 flex items-center justify-center"
        dangerouslySetInnerHTML={{
          __html: svg,
        }}
      />
    </div>
  )
}
