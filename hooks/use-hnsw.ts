import { useEffect, useRef } from "react"
import { DataSpace } from "@/worker/DataSpace"
import { IEmbedding } from "@/worker/meta_table/embedding"
import { zip } from "lodash"

import { PDFLoader } from "@/lib/ai/doc_loader/pdf"
import { LLMOpenAI } from "@/lib/ai/llm_vendors/openai"
import { getOpenAI } from "@/lib/ai/openai"
import { getHnswIndex } from "@/lib/ai/vec_search"
import { EmbeddingTableName } from "@/lib/sqlite/const"
import { getUuid } from "@/lib/utils"

import { useSqlite } from "./use-sqlite"

// we can't import hnswlib in worker directly, because it's also a web worker
class EmbeddingManager {
  dataSpace: DataSpace

  constructor(dataSpace: DataSpace) {
    this.dataSpace = dataSpace
  }

  getEmbeddingMethod(
    model: string,
    provider: {
      name: "openai"
      token: string
    }
  ) {
    if (provider.name === "openai") {
      const openai = getOpenAI(provider.token)
      const llmOpenAI = new LLMOpenAI(openai)
      return (text: string[]) => llmOpenAI.embedding(text, model)
    }
    return (text: string[]) => Promise.resolve([])
  }

  /**
   * @param model
   * @param source for hnswlib, it's the filename. for query, it's scope param
   */
  async filterEmbeddings(model: string, source: string) {
    const res = await this.dataSpace.sql2`SELECT * FROM ${Symbol(
      EmbeddingTableName
    )} WHERE model = ${model} AND source = ${source}`

    const embeddingIndexMap = new Map<number, IEmbedding>()
    const embeddings: number[][] = []
    res.forEach((row, index) => {
      const embedding = JSON.parse(row.embedding)
      embeddingIndexMap.set(index, row)
      embeddings.push(embedding)
    })
    return {
      embeddings,
      embeddingIndexMap,
    }
  }

  public async query(
    query: string,
    model: string,
    scope: string,
    k = 3,
    provider: {
      name: "openai"
      token: string
    }
  ) {
    const embeddingMethod = this.getEmbeddingMethod(model, provider)
    const embeddings = await embeddingMethod([query])
    const embedding = embeddings[0]
    console.log({
      text: query,
      embedding,
    })
    if (!embedding) return []
    const { exists, vectorHnswIndex } = await getHnswIndex(model, scope)
    const { embeddingIndexMap, embeddings: oldEmbeddings } =
      await this.filterEmbeddings(model, scope)
    if (!exists) {
      vectorHnswIndex.addItems(oldEmbeddings, true)
    }
    const { neighbors } = vectorHnswIndex.searchKnn(
      embedding,
      k,
      undefined
    ) as any
    const res = neighbors.map((index: any) => {
      const row = embeddingIndexMap.get(index)
      return row
    })
    console.log(neighbors, res)
    return res
  }

  public async createEmbedding(
    id: string,
    type: "doc" | "table" | "file",
    model: string,
    provider: {
      name: "openai"
      token: string
    }
  ) {
    let loader
    switch (type) {
      case "file":
        // pdf
        loader = new PDFLoader()
        break
      case "doc":
      case "table":
      default:
        throw new Error("unknown type")
    }
    const file = await this.dataSpace.getFileById(id)
    if (!file) {
      throw new Error("file not found")
    }
    if (file.isVectorized) {
      console.warn("file is already vectorized")
      return
    }
    const pages = await loader!.load(file.path)
    if (!pages.length) return
    const embeddingMethod = this.getEmbeddingMethod(model, provider)
    const embeddings = await embeddingMethod(pages.map((page) => page.content))
    for (const [page, embedding] of zip(pages, embeddings)) {
      if (page && embedding) {
        await this.dataSpace.addEmbedding({
          id: getUuid(),
          embedding: JSON.stringify(embedding),
          model,
          rawContent: page.content,
          sourceType: type,
          source: id,
        })
      }
    }
    await this.dataSpace.updateFileVectorized(id, true)
  }
}

export const useHnsw = () => {
  const { sqlite } = useSqlite()
  const emRef = useRef<EmbeddingManager | null>(null)

  useEffect(() => {
    if (sqlite) {
      emRef.current = new EmbeddingManager(sqlite)
    }
  }, [sqlite])
  // embedding
  async function createEmbedding(data: {
    id: string
    type: "doc" | "table" | "file"
    model: string
    provider: {
      name: "openai"
      token: string
    }
  }) {
    const { id, type, model, provider } = data
    return await emRef.current?.createEmbedding(id, type, model, provider)
  }

  async function queryEmbedding(data: {
    query: string
    model: string
    scope: string
    k?: number
    provider: {
      name: "openai"
      token: string
    }
  }): Promise<any[]> {
    const { query, model, scope, k, provider } = data
    return await emRef.current?.query(query, model, scope, k, provider)
  }

  useEffect(() => {
    navigator.serviceWorker.onmessage = async (event) => {
      const { type, data } = event.data
      console.log("hnsw", type, data)
      if (type === "createEmbedding") {
        const res = await createEmbedding(data)
        event.ports[0].postMessage(res)
      } else if (type === "queryEmbedding") {
        const res = await queryEmbedding(data)
        event.ports[0].postMessage(res)
      }
    }
  }, [])

  return {
    createEmbedding,
    queryEmbedding,
  }
}
