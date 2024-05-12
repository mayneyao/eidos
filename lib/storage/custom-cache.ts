/**
 * custom transformer.js cache load data from efs
 *
 */

import { efsManager } from "./eidos-file-system"

export const customCache = {
  match: async (
    req: Request,
    options?: {
      ignoreSearch?: boolean
      ignoreMethod?: boolean
      ignoreVary?: boolean
      cacheName?: string
    }
  ) => {
    const pathname = new URL(req.url).pathname
    const paths = pathname.split("/").filter(Boolean)
    console.log("customCache match", req.url)
    const file = await efsManager.getFile(paths)
    const headers = new Headers()
    headers.append("Content-Type", file.type)
    headers.append("Cross-Origin-Embedder-Policy", "require-corp")
    return new Response(file, { headers })
  },
  put: async (req: Request, response: Response) => {
    const pathname = new URL(req.url).pathname
    const paths = pathname.split("/").filter(Boolean)
    const filename = paths.pop()! as string
    const blob = await response.blob()
    await efsManager.addFile(paths, new File([blob], filename))
  },
}
