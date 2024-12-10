import { useEffect } from "react"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import * as LexicalMarkdown from "@lexical/markdown"
import * as BlockWithAlignableContents from "@lexical/react/LexicalBlockWithAlignableContents"
import * as LexicalComposerContext from "@lexical/react/LexicalComposerContext"
import * as LexicalUtils from "@lexical/utils"
import * as Lexical from "lexical"
import * as React from "react"
import { useState } from "react"


const SCRIPT_ELEMENT_ID = "doc-ext-plugin-loader"


export const useEnabledExtDocPlugins = (disableExtPlugins = false) => {
    const { space } = useCurrentPathInfo()
    const [loading, setLoading] = useState(true)
    const { sqlite } = useSqlite()
    useEffect(() => {
        if (!sqlite || disableExtPlugins) return
        sqlite?.listScripts("enabled").then((res) => {
            const scripts = res.filter((script) => script.type === "doc_plugin" && script.enabled)
            setLoading(true)
                ; (window as any)["__REACT"] = React
                ; (window as any)["__LEXICAL"] = Lexical
                ; (window as any)["__@LEXICAL/UTILS"] = LexicalUtils
                ; (window as any)["__@LEXICAL/MARKDOWN"] = LexicalMarkdown
                ; (window as any)["__@LEXICAL/REACT/LEXICALCOMPOSERCONTEXT"] =
                    LexicalComposerContext
                ; (window as any)["__@LEXICAL/REACT/LEXICALBLOCKWITHALIGNABLECONTENTS"] =
                    BlockWithAlignableContents
                ; (window as any)["__DOC_EXT_PLUGINS"] = []

            const script = document.createElement("script")
            script.id = SCRIPT_ELEMENT_ID
            script.type = "module"

            let scriptContent = `
            window.__DOC_EXT_PLUGINS = []
          `
            scripts.forEach((script) => {
                const code = script.code
                const pluginBlob = new Blob([code], {
                    type: "application/javascript;charset=utf-8",
                })
                const pluginUrl = URL.createObjectURL(pluginBlob)
                const pluginName = `DocExtPlugin__${script.id}`
                scriptContent += `
                import ${pluginName} from "${pluginUrl}"
                window.__DOC_EXT_PLUGINS.push({
                    name: "${pluginName}",
                    plugin: ${pluginName}
                })
            `
            })
            const existingScript = document.getElementById(SCRIPT_ELEMENT_ID)
            if (existingScript) {
                existingScript.remove()
            }

            script.innerHTML = scriptContent
            document.body.appendChild(script)
            setTimeout(() => {
                const plugins = (window as any).__DOC_EXT_PLUGINS
                if (plugins.length === scripts.length) {
                    setLoading(false)
                }
            }, 100)
        })
    }, [space, sqlite])

    return {
        loading,
    }
}
