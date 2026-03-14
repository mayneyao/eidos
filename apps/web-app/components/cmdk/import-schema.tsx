"use client"

import { useState } from "react"
import type { TableSchemaExport } from "@/packages/core/sdk/schema"
import { CheckIcon, Loader2Icon, TableIcon } from "lucide-react"

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useNodeStore } from "@/apps/web-app/store/node-store"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { TreeNodeType } from "@/packages/core/types/ITreeNode"

/**
 * Decode a base64-encoded schema string exported by "Copy Schema".
 * Handles unicode characters via the encodeURIComponent / decodeURIComponent trick.
 */
function decodeSchema(encoded: string): TableSchemaExport {
  try {
    // Reverse of: btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, ...))
    const json = decodeURIComponent(
      atob(encoded.trim())
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    )
    const parsed = JSON.parse(json)
    if (parsed.version !== 1 || !parsed.name || !Array.isArray(parsed.fields)) {
      throw new Error("Invalid schema format")
    }
    return parsed as TableSchemaExport
  } catch (e) {
    throw new Error(
      "Could not decode schema. Make sure you pasted the full base64 string from 'Copy Schema'."
    )
  }
}

interface ImportSchemaProps {
  onDone: () => void
}

export function ImportSchema({ onDone }: ImportSchemaProps) {
  const [encoded, setEncoded] = useState("")
  const [preview, setPreview] = useState<TableSchemaExport | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const { sqlite } = useSqlite()
  const { addNode } = useNodeStore()
  const { toast } = useToast()

  const handleDecode = () => {
    setParseError(null)
    setPreview(null)
    if (!encoded.trim()) return
    try {
      const schema = decodeSchema(encoded)
      setPreview(schema)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Decode failed")
    }
  }

  const handleCreate = async () => {
    if (!preview || !sqlite) return
    setCreating(true)
    try {
      const tableInfo = await sqlite.schema.import(preview)
      // Register node in local store so the sidebar updates
      addNode({
        id: tableInfo.id,
        name: tableInfo.name,
        type: TreeNodeType.Table,
      })
      toast({
        title: "Table Created",
        description: `"${tableInfo.name}" was created with ${tableInfo.fields.length} fields.`,
      })
      onDone()
    } catch (err) {
      console.error("Import schema failed:", err)
      toast({
        title: "Import Failed",
        description:
          err instanceof Error ? err.message : "Unknown error occurred",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-10">
      <div className="flex items-center gap-2 text-sm font-medium">
        <TableIcon className="h-4 w-4" />
        <span>Import Table Schema</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Paste the base64 schema string (from Right-click → Export → Copy
        Schema) to recreate a table structure.
      </p>

      <Textarea
        placeholder="Paste base64 schema string here…"
        value={encoded}
        onChange={(e) => {
          setEncoded(e.target.value)
          setPreview(null)
          setParseError(null)
        }}
        className="font-mono text-xs min-h-[80px] resize-none"
        autoFocus
      />

      {parseError && (
        <p className="text-xs text-destructive">{parseError}</p>
      )}

      {!preview && (
        <Button
          size="sm"
          variant="outline"
          disabled={!encoded.trim()}
          onClick={handleDecode}
        >
          Preview Schema
        </Button>
      )}

      {preview && (
        <div className="rounded-md border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{preview.name}</span>
            <span className="text-xs text-muted-foreground">
              {preview.fields.length} field{preview.fields.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ul className="space-y-0.5">
            {preview.fields.map((f) => (
              <li
                key={f.columnName}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span className="w-2 h-2 rounded-full bg-primary/60 flex-shrink-0" />
                <span className="font-medium text-foreground">{f.name}</span>
                <span className="ml-auto opacity-60">{f.type}</span>
              </li>
            ))}
          </ul>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1"
              disabled={creating}
              onClick={handleCreate}
            >
              {creating ? (
                <Loader2Icon className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckIcon className="mr-2 h-3.5 w-3.5" />
              )}
              {creating ? "Creating…" : "Create Table"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={creating}
              onClick={() => {
                setPreview(null)
                setEncoded("")
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
