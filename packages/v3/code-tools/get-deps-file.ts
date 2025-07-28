import { parseSync, type Program } from 'oxc-parser';

/**
 * Get local imports from code (imports starting with './' or '../')
 */
function getLocalImportsFromCode(code: string): string[] {
    const imports = new Set<string>();

    if (!code) {
        return [];
    }

    try {
        const ast: Program = parseSync("file.tsx", code).program;

        const walk = (node: any, visitor: (node: any) => void) => {
            if (!node) return;

            visitor(node);

            if (Array.isArray(node)) {
                for (const item of node) {
                    walk(item, visitor);
                }
                return;
            }

            if (typeof node === 'object') {
                for (const key in node) {
                    if (key !== 'span') {
                        walk((node as any)[key], visitor);
                    }
                }
            }
        };

        walk(ast, (node: any) => {
            if (node) {
                // Handle static imports: import ... from './file'
                if (node.type === 'ImportDeclaration' && node.source?.value) {
                    const importPath = node.source.value;
                    if (isLocalImport(importPath)) {
                        imports.add(importPath);
                    }
                }
                // Handle dynamic imports: import('./file')
                if (node.type === 'ImportExpression' && node.source?.type === 'Literal' && typeof node.source.value === 'string') {
                    const importPath = node.source.value;
                    if (isLocalImport(importPath)) {
                        imports.add(importPath);
                    }
                }
            }
        });
    } catch (e) {
        console.error("Failed to parse with oxc:", e);
        // Fallback to regex for robustness if oxc fails
        const fromImportRegex = /import\s+[\s\S]*?\s+from\s+['"](\.\.?\/.*?)['"];?/g;
        let match;
        while ((match = fromImportRegex.exec(code)) !== null) {
            imports.add(match[1]);
        }

        // Regex for side-effect imports like: import "./file";
        const sideEffectImportRegex = /import\s+['"](\.\.?\/.*?)['"];?/g;
        while ((match = sideEffectImportRegex.exec(code)) !== null) {
            imports.add(match[1]);
        }

        // Regex for dynamic imports: import('./file')
        const dynamicImportRegex = /import\s*\(\s*['"](\.\.?\/.*?)['"\s]*\)/g;
        while ((match = dynamicImportRegex.exec(code)) !== null) {
            imports.add(match[1]);
        }
    }

    return Array.from(imports);
}

/**
 * Check if an import path is a local file import
 */
function isLocalImport(importPath: string): boolean {
    return importPath.startsWith('./') || importPath.startsWith('../');
}

/**
 * Normalize import path by removing file extensions and handling index files
 */
function normalizeImportPath(importPath: string): string {
    // Remove common file extensions
    const withoutExt = importPath.replace(/\.(ts|tsx|js|jsx)$/, '');

    // Handle index files - if path ends with /index, remove it
    if (withoutExt.endsWith('/index')) {
        return withoutExt.replace('/index', '');
    }

    return withoutExt;
}

/**
 * Resolve import path relative to current file
 * This is a simplified version - in a real implementation you might need more sophisticated path resolution
 */
function resolveImportPath(currentFileId: string, importPath: string): string {
    // For simplicity, we assume file IDs are already normalized paths
    // In a real implementation, you might need to handle directory traversal (.., .)

    if (importPath.startsWith('./')) {
        // Same directory import
        const currentDir = currentFileId.includes('/') ? currentFileId.substring(0, currentFileId.lastIndexOf('/')) : '';
        const relativePath = importPath.substring(2); // Remove './'
        return currentDir ? `${currentDir}/${relativePath}` : relativePath;
    } else if (importPath.startsWith('../')) {
        // Parent directory import - simplified handling
        const currentFileParts = currentFileId.split('/');
        const importParts = importPath.split('/');

        // Remove the current file name to get the directory
        const currentDirParts = currentFileParts.slice(0, -1);

        let upLevels = 0;
        for (const part of importParts) {
            if (part === '..') {
                upLevels++;
            } else {
                break;
            }
        }

        const remainingImportPath = importParts.slice(upLevels).join('/');
        const baseParts = currentDirParts.slice(0, -upLevels + 1); // Go up the required levels

        if (remainingImportPath) {
            return baseParts.length > 0 ? `${baseParts.join('/')}/${remainingImportPath}` : remainingImportPath;
        } else {
            return baseParts.join('/');
        }
    }

    return importPath;
}

export interface FileResolver {
    (fileId: string): Promise<{
        ext: 'ts' | 'tsx',
        content: string,
    } | null>

}

export interface ResolvedFile {
    id: string;
    content: string;
    ext: 'ts' | 'tsx',
    imports: string[];
}

/**
 * Recursively resolve all local file dependencies starting from a given file
 *
 * @param fileId - The ID of the starting file
 * @param fileContent - The content of the starting file
 * @param getFileContent - Function to get file content by ID
 * @returns Promise resolving to array of all related files including the starting file
 */
export async function resolveLocalFileDependencies(
    fileId: string,
    fileContent: string,
    ext: 'ts' | 'tsx',
    getFileContent: FileResolver
): Promise<ResolvedFile[]> {
    const resolvedFiles = new Map<string, ResolvedFile>();
    const processedFiles = new Set<string>();
    const queue: Array<{ id: string; content: string; ext: 'ts' | 'tsx' }> = [{ id: fileId, content: fileContent, ext }];

    while (queue.length > 0) {
        const current = queue.shift()!;

        if (processedFiles.has(current.id)) {
            continue;
        }

        processedFiles.add(current.id);

        // Get local imports from current file
        const localImports = getLocalImportsFromCode(current.content);

        // Store current file info
        resolvedFiles.set(current.id, {
            id: current.id,
            content: current.content,
            ext: current.ext,
            imports: localImports
        });

        // Process each local import
        for (const importPath of localImports) {
            const resolvedPath = resolveImportPath(current.id, importPath);
            const normalizedPath = normalizeImportPath(resolvedPath);

            if (!processedFiles.has(normalizedPath)) {
                try {
                    // Try to get the file content
                    const importedFile = await getFileContent(normalizedPath);

                    if (importedFile) {
                        queue.push({ id: normalizedPath, content: importedFile.content, ext: importedFile.ext });
                    } else {
                        // Try with common extensions if the normalized path doesn't work
                        const extensions = ['.ts', '.tsx', '.js', '.jsx'];
                        let found = false;

                        for (const ext of extensions) {
                            const pathWithExt = normalizedPath + ext;
                            const fileWithExt = await getFileContent(pathWithExt);
                            if (fileWithExt) {
                                queue.push({ id: pathWithExt, content: fileWithExt.content, ext: fileWithExt.ext });
                                found = true;
                                break;
                            }
                        }

                        // Try index files
                        if (!found) {
                            for (const ext of extensions) {
                                const indexPath = `${normalizedPath}/index${ext}`;
                                const indexFile = await getFileContent(indexPath);
                                if (indexFile) {
                                    queue.push({ id: indexPath, content: indexFile.content, ext: indexFile.ext });
                                    break;
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to resolve import: ${importPath} -> ${normalizedPath}`, error);
                }
            }
        }
    }

    return Array.from(resolvedFiles.values());
}