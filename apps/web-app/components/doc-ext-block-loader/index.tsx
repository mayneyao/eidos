import * as LexicalMarkdown from "@lexical/markdown"
import * as BlockWithAlignableContents from "@lexical/react/LexicalBlockWithAlignableContents"
import * as LexicalComposerContext from "@lexical/react/LexicalComposerContext"
import * as LexicalUtils from "@lexical/utils"
import * as Lexical from "lexical"
import * as React from "react"
import { useEffect } from "react"


import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useEnabledExtBlocks } from "../doc/hooks/use-ext-blocks"

const ScriptElementId = "doc-ext-block-loader"
export const DocExtBlockLoader = () => {
  const { scripts: allEnabledExtBlocks } = useEnabledExtBlocks()
  const { sqlite } = useSqlite()

  useEffect(() => {
    async function loadBlocks() {
      if (!sqlite) return
      try {
        // extensions/blocks is in the root of the workspace?
        // Wait, efsManager.listDir(["extensions", "blocks"]) implies it's in the FS.
        // If it's in the FS, we can use sqlite.fs.readdir.
        // But where is "extensions/blocks"?
        // It seems it might be in the user's workspace.
        // Let's assume it is at `extensions/blocks`.
        const blockDirs = await sqlite.fs.readdir("extensions/blocks", { withFileTypes: true })
        const script = document.createElement("script")
        script.id = ScriptElementId
        // script.async = true
        script.type = "module"

        const scriptContent = blockDirs
          .filter((dir) => {
            return dir.kind === 'directory' && allEnabledExtBlocks.some((block) => block.name === dir.name)
          })
          .reduce((acc, dir) => {
            const blockName = dir.name.replace(/-([a-z])/g, function (g) {
              return g[1].toUpperCase()
            })
            return (
              acc +
              `import ${blockName} from '/extensions/blocks/${dir.name}/index.js'\n` +
              `window.__DOC_EXT_BLOCKS.push(${blockName})\n`
            )
          }, "window.__DOC_EXT_BLOCKS = []\n")

        const existingScript = document.getElementById(ScriptElementId)
        script.innerHTML = scriptContent
        if (existingScript) {
          existingScript.remove()
        }
        document.body.appendChild(script)
      } catch (e) {
        console.error("Failed to load ext blocks", e)
      }
    }

    ; (window as any)["__REACT"] = React
      ; (window as any)["__LEXICAL"] = Lexical
      ; (window as any)["__@LEXICAL/UTILS"] = LexicalUtils
      ; (window as any)["__@LEXICAL/MARKDOWN"] = LexicalMarkdown
      ; (window as any)["__@LEXICAL/REACT/LEXICALCOMPOSERCONTEXT"] =
        LexicalComposerContext
      ; (window as any)["__@LEXICAL/REACT/LEXICALBLOCKWITHALIGNABLECONTENTS"] =
        BlockWithAlignableContents
    loadBlocks()
  }, [allEnabledExtBlocks, sqlite])
  return <div></div>
}
