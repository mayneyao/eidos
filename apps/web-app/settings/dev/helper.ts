import { useEmbedding } from "@/hooks/use-embedding"
import { EmbeddingManager, useHnsw } from "@/hooks/use-hnsw"
import { LLMBaseVendor } from "@/lib/ai/llm_vendors/base"
import { BGEM3 } from "@/lib/ai/llm_vendors/bge"
import { getSqliteProxy } from "@/lib/sqlite/channel"
import { efsManager } from "@/lib/storage/eidos-file-system"

const needRemovedPaths = ["resolve", "main"]
export const saveTransformerCache = async () => {
  const cache = await caches.open("transformers-cache")
  const allKeys = await cache.keys()
  for (const key of allKeys) {
    const response = await cache.match(key)
    let paths = new URL(key.url).pathname.split("/").filter(Boolean)
    const name = paths.pop() as string
    // filter paths
    paths = paths.filter((path) => !needRemovedPaths.includes(path))
    const blob = await response?.blob()
    if (blob) {
      const file = new File([blob], name)
      const dirs = ["static", "transformers", ...paths]
      const isFileExist = await efsManager.checkFileExists([...dirs, name])
      if (!isFileExist) {
        await efsManager.addFile(dirs, file)
        console.log("saved", key.url)
      } else {
        console.log("file already exist", key.url)
      }
    }
  }
}


export const useEmbedSpace = () => {
  const { embeddingTexts } = useEmbedding()
  const embedSpace = async (space: string, onProgress: (progress: number) => void) => {
    // get all documents in the space
    const sqlWorker = getSqliteProxy(space, "devtools")
    const em = new EmbeddingManager(sqlWorker, space)
    const docIds = await sqlWorker.listAllDocIds()
    console.log("docIds", docIds)
    const total = docIds.length
    let progress = 0
    for (const docId of docIds) {
      console.log("docId", docId)
      await em.createEmbedding(docId, "doc", "bge-m3", new BGEM3(embeddingTexts))
      console.log("embeded", docId)
      progress++
      onProgress(progress / total * 100)
    }
  }
  return { embedSpace }
}
