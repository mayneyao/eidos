import { useCallback, useMemo, useRef } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { compileCode } from "@/packages/v3/compiler"
import { getCompileMethod } from "@/packages/v3/script-compiler"
import { useMount } from "ahooks"
import { Copy, ExternalLink, Play } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLoaderData, useRevalidator } from "react-router-dom"

import { isDesktopMode } from "@/lib/env"
import { getExtensionUrl, isUuid } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { usePlayground } from "@/apps/desktop/renderer/hooks/usePlayground"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useScriptCall } from "@/apps/web-app/hooks/use-script-call"

import { useExtension } from "../../../../hooks/use-extension"
import { useEditorStore } from "../stores/editor-store"
import { CheckForUpdatesButton } from "./check-for-updates-button"
import { ShareExtensionButton } from "./share-extension-button"

export const openUrlViaDefaultBrowser = (url: string) => {
  window.eidos.openUrl(url)
}

export const ExtensionToolbar = () => {
  const { t } = useTranslation()
  const script = useLoaderData() as IExtension
  const { updateExtension } = useExtension()
  const editorRef = useRef<{ save: () => void; layout: () => void }>(null)
  const revalidator = useRevalidator()

  const { callScript } = useScriptCall()
  useMount(() => {
    revalidator.revalidate()
  })

  const { toast } = useToast()
  const onSubmit = useCallback(
    async (code: string, ts_code?: string) => {
      if (code !== script.code || ts_code !== script.ts_code) {
        await updateExtension({
          id: script.id,
          code,
          ts_code,
        })
        revalidator.revalidate()
        toast({
          title: t("extension.toolbar.codeUpdated"),
        })
      }
    },
    [revalidator, script, toast, updateExtension, t]
  )

  const { space } = useCurrentPathInfo()

  const manualSave = () => {
    editorRef.current?.save()
  }

  const blockCodeCompile = async (ts_code: string) => {
    const result = await compileCode(ts_code)
    return result.code
  }

  const handleCopyCode = useCallback(() => {
    const codeToCopy = script.ts_code || script.code
    navigator.clipboard.writeText(codeToCopy)
    toast({
      title: t("extension.toolbar.codeCopied"),
      duration: 2000,
    })
  }, [script.ts_code, script.code, toast, t])

  const { initializePlayground } = usePlayground({
    onChange: (filename, content, spaceName, blockId) => {
      if (spaceName !== space || blockId !== script.id) {
        return
      }
      if (filename === "index.jsx") {
        blockCodeCompile(content).then((code) => {
          onSubmit(code, content)
        })
      }
    },
  })

  const { isRemixMode, setIsRemixMode } = useEditorStore()

  const handleRunScript = useCallback(async () => {
    if (!script.code) {
      if (script.ts_code) {
        toast({
          title: t(
            "extension.toolbar.autoBuildingScript",
            "Auto-building script..."
          ),
        })
        try {
          const compileMethod = getCompileMethod(script)
          if (!compileMethod) {
            return
          }
          const compiledJs = await compileMethod(script.ts_code)
          await updateExtension({
            id: script.id,
            code: compiledJs,
            ts_code: script.ts_code,
          })
          revalidator.revalidate()
          toast({
            title: t(
              "extension.toolbar.buildSuccessful",
              "Build successful, running script."
            ),
          })
          callScript(script.id, {})
        } catch (error) {
          console.error("Auto-build or update script failed:", error)
          toast({
            title: t("extension.toolbar.buildFailed", "Build failed"),
            description:
              (error as Error)?.message ||
              t("common.unknownError", "An unknown error occurred."),
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: t(
            "extension.toolbar.noTsCodeToBuild",
            "No source code to build from."
          ),
          description: t(
            "extension.toolbar.noTsCodeToBuildHint",
            "Please ensure the script has TypeScript/JavaScript source code."
          ),
          variant: "destructive",
        })
      }
    } else {
      callScript(script.id, {})
    }
  }, [script, callScript, toast, t, updateExtension, revalidator, compileCode])

  // if script.id is a uuid, it means the script is forked from marketplace
  const isScriptForkFromMarketplace = useMemo(() => {
    return isUuid(script.id)
  }, [script.id])

  const handleOpenInStandalone = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isDesktopMode && event.altKey) {
        openUrlViaDefaultBrowser(getExtensionUrl(script.id, space))
      } else {
        window.open(getExtensionUrl(script.id, space), "_blank")
      }
    },
    [script.id, space]
  )

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={handleCopyCode}>
        <Copy className="h-4 w-4" />
        {/* {t("extension.toolbar.copy")} */}
      </Button>

      {script.type === "script" && (
        <Button variant="ghost" size="sm" onClick={handleRunScript}>
          <Play className="h-4 w-4" />
          {/* {t("extension.toolbar.run")} */}
        </Button>
      )}

      {script.type === "block" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenInStandalone}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          title="Open in standalone mode (Hold Alt/Option to open in default browser)"
        >
          <ExternalLink className="h-4 w-4" />
          {/* <span>Standalone</span> */}
        </Button>
      )}
      <ShareExtensionButton
        script={script}
        onSuccess={() => revalidator.revalidate()}
      />
      {isScriptForkFromMarketplace && (
        <CheckForUpdatesButton
          script={script}
          editorContent={script.ts_code || script.code}
        />
      )}
    </div>
  )
}
