import { useCallback, useState } from "react"
import { canEjectExtension, ejectBuiltInExtension } from "@/extensions/builtin"
import { compileCode } from "@eidos.space/v3"

import { useToast } from "@/components/ui/use-toast"

import { useSqlite } from "./use-sqlite"

export function useEjectExtension() {
  const { sqlite } = useSqlite()
  const { toast } = useToast()
  const [isEjecting, setIsEjecting] = useState(false)

  const eject = useCallback(
    async (slug: string): Promise<boolean> => {
      if (!sqlite) {
        toast({
          title: "Error",
          description: "Database not available",
          variant: "destructive",
        })
        return false
      }

      if (!canEjectExtension(slug)) {
        toast({
          title: "Error",
          description: `Extension "${slug}" cannot be ejected`,
          variant: "destructive",
        })
        return false
      }

      setIsEjecting(true)

      try {
        const result = ejectBuiltInExtension(slug)

        // Create all extension records
        for (const record of result.all) {
          // Check if slug already exists
          const existing = await sqlite.extension.getExtensionBySlug(
            record.slug
          )
          if (existing) {
            toast({
              title: "Already Ejected",
              description: `Extension "${record.slug}" already exists`,
              variant: "destructive",
            })
            return false
          }

          // Compile TypeScript to JavaScript
          // blocks contain JSX (.tsx), scripts are pure TypeScript (.ts)
          const isTsx = record.type === "block"
          const compileResult = await compileCode(record.ts_code, { isTsx })
          if (compileResult.error) {
            throw new Error(`Compile error: ${compileResult.error}`)
          }

          // Create extension record
          const id = crypto.randomUUID()
          await sqlite.extension.add({
            id,
            slug: record.slug,
            name: record.name,
            description: record.description,
            type: record.type,
            code: compileResult.code,
            ts_code: record.ts_code,
            meta: record.meta,
            icon: record.icon,
            enabled: record.isMainEntry,
          })
        }

        toast({
          title: "Extension Ejected",
          description: `Created ${result.all.length} file(s) for "${result.mainEntry.name}"`,
        })

        return true
      } catch (error) {
        console.error("Eject error:", error)
        toast({
          title: "Eject Failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
        return false
      } finally {
        setIsEjecting(false)
      }
    },
    [sqlite, toast]
  )

  return {
    eject,
    isEjecting,
    canEject: canEjectExtension,
  }
}
