import { useMemo, useState } from "react"
import { CopyIcon } from "lucide-react"

import { Button } from "../ui/button"
import { toast } from "../ui/use-toast"

interface CopyShowHideProps {
  text: string
  hideMask?: [number, number]
}
export const CopyShowHide = ({ text, hideMask }: CopyShowHideProps) => {
  const [show, setShow] = useState(false)
  const handleCopyUrl = (e: React.MouseEvent) => {
    e.preventDefault()
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied to clipboard",
    })
  }
  //   slice text to show by hideMask
  const displayText = useMemo(() => {
    if (show) return text
    if (!hideMask) return "*".repeat(text.length)
    if (hideMask)
      return (
        text.slice(0, hideMask[0]) +
        "*".repeat(hideMask[1] - hideMask[0]) +
        text.slice(hideMask[1])
      )
  }, [show, text, hideMask])

  return (
    <div className="flex w-full gap-2 rounded-sm bg-slate-100  p-1  font-mono ">
      <input
        disabled
        className="w-full border-none bg-transparent text-cyan-500 outline-none "
        value={displayText}
      ></input>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setShow((prev) => !prev)}
      >
        {show ? "Hide" : "Show"}
      </Button>
      <Button variant="ghost" size="xs" onClick={handleCopyUrl}>
        Copy
      </Button>
    </div>
  )
}
