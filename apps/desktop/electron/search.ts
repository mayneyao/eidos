import { rgPath } from '@vscode/ripgrep'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'

const execFileAsync = promisify(execFile)

/**
 * Get the executable path for ripgrep
 * Handles the case where the binary is unpacked from ASAR
 */
async function getExecutablePath(): Promise<string> {
    let finalPath = rgPath

    // In production with asar, the binary might be in app.asar.unpacked
    if (finalPath.includes('app.asar')) {
        const unpackedPath = finalPath.replace('app.asar', 'app.asar.unpacked')
        try {
            await fs.stat(unpackedPath)
            finalPath = unpackedPath
        } catch {
            // Fallback to original path if unpacked doesn't exist
        }
    }

    return finalPath
}

export async function searchWithRg(query: string, searchPaths: string[]): Promise<string[]> {
    const binPath = await getExecutablePath()

    // Parse query into keywords
    const keywords = query.split(/\s+/).filter(k => k.length > 0)
    if (keywords.length === 0) {
        return []
    }

    // Use the longest keyword for the initial glob to optimize search
    const primaryKeyword = keywords.reduce((a, b) => a.length >= b.length ? a : b)

    try {
        // Run ripgrep
        // --files: Print each file that would be searched without actually performing the search
        // --glob: Include or exclude files and directories for searching that match the given glob
        // -i: Ignore case
        const { stdout } = await execFileAsync(binPath, [
            '--files',
            '--hidden',
            '--glob', `*${primaryKeyword}*`,
            '--ignore-case',
            ...searchPaths
        ], {
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        })

        return stdout.split('\n').filter(Boolean)
    } catch (error: any) {
        // ripgrep returns exit code 1 if no matches found, which execFile treats as error
        if (error.code === 1) {
            return []
        }
        console.error('Search failed:', error)
        return []
    }
}
