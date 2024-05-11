import { HnswlibModule, loadHnswlib } from "hnswlib-wasm"

let hnswlib: HnswlibModule
const EF_SIZE = 32
const MAX_ELEMENTS = 100000

const getHnswlib = async () => {
  if (!hnswlib) {
    hnswlib = await loadHnswlib()
  }
  return hnswlib
}

const modelInfoMap: {
  [key: string]: {
    dim: number
    defaultSpaceName: string
  }
} = {
  "text-embedding-ada-002": {
    dim: 1536,
    defaultSpaceName: "cosine", // recommend by openai
  },
  "bge-m3": {
    dim: 1024,
    defaultSpaceName: "cosine",
  },
}

export const getHnswIndex = async (model: string, filename: string) => {
  const hnswlib = await getHnswlib()
  const modelInfo = modelInfoMap[model]
  hnswlib.EmscriptenFileSystemManager.setDebugLogs(true)
  const vectorHnswIndex = new hnswlib.HierarchicalNSW(
    "cosine",
    modelInfo.dim,
    filename
  )
  const exists = hnswlib.EmscriptenFileSystemManager.checkFileExists(filename)
  if (!exists) {
    vectorHnswIndex.initIndex(MAX_ELEMENTS, 48, 128, 100)
    vectorHnswIndex.setEfSearch(EF_SIZE)
    vectorHnswIndex.writeIndex(filename)
  } else {
    vectorHnswIndex.readIndex(filename, MAX_ELEMENTS)
    vectorHnswIndex.setEfSearch(EF_SIZE)
  }
  return {
    vectorHnswIndex,
    exists,
  }
}
