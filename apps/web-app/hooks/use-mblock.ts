import { useEffect, useState } from "react"

import { useSqlite } from "./use-sqlite"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { getBuiltInExtensionById, type BuiltInExtension } from "@/extensions/builtin"

// Extended IExtension type that includes built-in flag
export type ExtensionWithBuiltIn = IExtension & {
    _builtIn?: boolean
    _builtInComponent?: BuiltInExtension['component']
}

/**
 * Hook to get an extension by ID
 * Checks both database extensions and built-in extensions registry
 */
export const useMblock = (id?: string): ExtensionWithBuiltIn | null => {
    const [block, setBlock] = useState<ExtensionWithBuiltIn | null>(null)
    const { sqlite } = useSqlite()
    
    useEffect(() => {
        if (!id) {
            setBlock(null)
            return
        }

        // First check if it's a built-in extension
        const builtIn = getBuiltInExtensionById(id)
        if (builtIn) {
            // Convert BuiltInExtension to IExtension-compatible format
            const ext: ExtensionWithBuiltIn = {
                id: builtIn.id,
                slug: builtIn.slug,
                name: builtIn.name,
                type: builtIn.type,
                code: '', // Built-in extensions don't need code field
                meta: builtIn.meta,
                enabled: true, // Built-in extensions are always enabled
                _builtIn: true,
                _builtInComponent: builtIn.component,
            } as ExtensionWithBuiltIn
            setBlock(ext)
            return
        }

        // Otherwise, fetch from database
        if (!sqlite) {
            return
        }
        sqlite.script.get(id).then(setBlock)
    }, [sqlite, id])
    
    return block
}

/**
 * Check if extension data represents a built-in extension
 */
export function isMblockBuiltIn(block: ExtensionWithBuiltIn | null): boolean {
    return block?._builtIn === true
}