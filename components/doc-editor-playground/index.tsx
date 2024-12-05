import * as React from "react"
import { useEffect, useState } from "react"
import * as LexicalMarkdown from "@lexical/markdown"
import * as BlockWithAlignableContents from "@lexical/react/LexicalBlockWithAlignableContents"
import * as LexicalComposerContext from "@lexical/react/LexicalComposerContext"
import * as LexicalUtils from "@lexical/utils"
import * as Lexical from "lexical"

import { InnerEditor } from "../doc/editor"

const SCRIPT_ELEMENT_ID = "playground-ext-plugin-loader"

export function DocEditorPlayground({ code }: { code: string }) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    ;(window as any)["__REACT"] = React
    ;(window as any)["__LEXICAL"] = Lexical
    ;(window as any)["__@LEXICAL/UTILS"] = LexicalUtils
    ;(window as any)["__@LEXICAL/MARKDOWN"] = LexicalMarkdown
    ;(window as any)["__@LEXICAL/REACT/LEXICALCOMPOSERCONTEXT"] =
      LexicalComposerContext
    ;(window as any)["__@LEXICAL/REACT/LEXICALBLOCKWITHALIGNABLECONTENTS"] =
      BlockWithAlignableContents

    const script = document.createElement("script")
    script.id = SCRIPT_ELEMENT_ID
    script.type = "module"
    const pluginBlob = new Blob([code], {
      type: "application/javascript;charset=utf-8",
    })
    const pluginUrl = URL.createObjectURL(pluginBlob)
    const scriptContent = `
      import MyPlugin from "${pluginUrl}"
      window.__DOC_EXT_PLUGINS = [MyPlugin]
    `
    const existingScript = document.getElementById(SCRIPT_ELEMENT_ID)
    if (existingScript) {
      existingScript.remove()
    }

    script.innerHTML = scriptContent
    document.body.appendChild(script)
    setTimeout(() => {
      const MyPlugin = (window as any).__DOC_EXT_PLUGINS?.[0]
      if (MyPlugin) {
        setLoading(false)
      }
    }, 1000)
  }, [code])

  if (loading) {
    return <div>Loading Plugin...</div>
  }
  const plugin = (window as any).__DOC_EXT_PLUGINS?.[0]
  if (!plugin) {
    return <div>No plugin found</div>
  }
  return (
    <div className="px-8 py-4">
      <InnerEditor isEditable plugins={React.createElement(plugin)} />
    </div>
  )
}
