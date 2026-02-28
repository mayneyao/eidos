import { useIndexedDB } from "@/apps/web-app/hooks/use-indexed-db"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { useCallback } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useExtension } from "../../../web-app/hooks/use-extension"
import { EIDOS_SPACE_BASE_URL } from "@/lib/const"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import {
  getCompileMethod,
  scriptCodeCompile,
} from "@/packages/v3/src/script-compiler"
import { extractConstant } from "@/packages/v3/src/code-tools/code-extractor"

export const useExtensionInstaller = () => {
  const { navigate } = useRouterAdapter()
  const { addExtension } = useExtension()
  const { sqlite } = useSqlite()
  const [lastOpenedDatabase] = useIndexedDB("kv", "lastOpenedDatabase", "")

  const installExtension = useCallback(
    async (extensionId: string) => {
      try {
        const response = await fetch(
          `${EIDOS_SPACE_BASE_URL}/api/extensions/${extensionId}/download`
        )
        if (!response.ok) {
          throw new Error(`Failed to fetch extension: ${response.statusText}`)
        }
        const extensionData = await response.json()

        const extensionIdFromApi = extensionData.extension.id

        if (sqlite) {
          const existingScript = await sqlite.script.get(extensionIdFromApi)
          if (existingScript) {
            console.log(
              `Extension ${extensionIdFromApi} already installed. Navigating...`
            )
            if (lastOpenedDatabase) {
              navigate(`/extensions/${existingScript.id}`)
            }
            return
          }
        }

        const type = extensionData.extension.type.split("/")[0]
        const compileMethod = getCompileMethod({ type: type })
        if (!compileMethod) {
          throw new Error(`Unsupported extension type: ${type}`)
        }
        const ts_code = extensionData.latestVersion.code
        const [code, meta] = await Promise.all([
          compileMethod(ts_code),
          extractConstant(ts_code, "meta"),
        ])
        const script: IExtension = {
          id: extensionIdFromApi,
          slug: `${extensionData.extension.type}-${extensionIdFromApi.slice(0, 8)}`,
          name: extensionData.extension.name,
          type: type,
          description: extensionData.extension.description,
          icon: extensionData.extension.icon_url,
          version: extensionData.latestVersion.version,
          ts_code: ts_code,
          code: code,
          meta: meta,
          enabled: true,
        }

        await addExtension(script)
        console.log(`Successfully installed extension: ${extensionId}`)
        if (lastOpenedDatabase) {
          navigate(`/extensions/${script.id}`)
        }
      } catch (error) {
        console.error("Error handling extension protocol action:", error)
        // TODO: Show error to user?
      }
    },
    [addExtension, navigate, lastOpenedDatabase, sqlite]
  )

  return { installExtension }
}
