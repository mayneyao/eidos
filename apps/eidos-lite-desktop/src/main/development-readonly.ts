import fs from "node:fs/promises"
import path from "node:path"

/** An explicit development-only access policy; unrelated roots retain normal access. */
export async function isDevelopmentReadonlyRoot(
  canonicalRoot: string,
  packaged: boolean,
  configuredRoot = process.env.EIDOS_LITE_DEV_READONLY_ROOT
): Promise<boolean> {
  if (packaged || configuredRoot === undefined) return false
  if (!path.isAbsolute(configuredRoot))
    throw new Error("The development read-only root must be an absolute path")
  return canonicalRoot === (await fs.realpath(configuredRoot))
}
