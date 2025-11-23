import { parsePatch, applyPatch, createPatch } from 'diff';

/**
 * Applies a patch to the original code to generate new code
 * @param originalCode The original source code
 * @param patchString The patch in unified diff format
 * @returns The new code after applying the patch
 */
export function applyCodePatch(originalCode: string, patchString: string): string {
    try {
        // Basic validation of patch string format
        if (typeof patchString !== 'string' || !patchString.includes('@@')) {
            throw new Error('Invalid patch format');
        }

        // Parse the patch string into a patch object
        const patches = parsePatch(patchString);

        if (!Array.isArray(patches) || patches.length === 0) {
            throw new Error('No changes found in patch string');
        }

        // Apply the first patch to the original code
        // Note: diff library only supports applying one patch at a time
        const results = applyPatch(originalCode, patches[0]);

        // If the result is false, it means the patch failed to apply
        if (results === false) {
            throw new Error('Failed to apply patch: Patch may be invalid or incompatible with the original code');
        }

        return results;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Error applying patch: ${error.message}`);
        }
        throw new Error('Unknown error occurred while applying patch');
    }
}

/**
 * Creates a patch string from original and new code
 * @param originalCode The original source code
 * @param newCode The new source code
 * @returns The patch string in unified diff format
 */
export function createCodePatch(originalCode: string, newCode: string): string {
    try {
        // Create a patch between the original and new code
        const patch = createPatch('code', originalCode, newCode);
        return patch;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Error creating patch: ${error.message}`);
        }
        throw new Error('Unknown error occurred while creating patch');
    }
}
