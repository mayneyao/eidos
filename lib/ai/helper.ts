import {
  WEB_LLM_MODELS,
  modelLibURLPrefix,
  modelVersion,
} from "@/components/ai-chat/webllm/models"

import { efsManager } from "../storage/eidos-file-system"

export type Model = (typeof WEB_LLM_MODELS)[0]

interface ModelFileListRecord {
  name: string
  shape: [number, number]
  dtype: string
  format: string
  nbytes: number
  byteOffset: number
}

interface ModelFileList {
  metadata: {
    ParamSize: number
    ParamBytes: number
    BitsPerParam: number
  }
  records: {
    dataPath: string
    format: string
    nbytes: number
    records: ModelFileListRecord[]
    md5sum: string
  }[]
}

export const getLocalModelList = (modelIds: string[]) => {
  return modelIds.map((modelId) => {
    const originalModel = WEB_LLM_MODELS.find(
      (item) => item.model_id === modelId
    )
    const wasmFileName = originalModel?.model_lib_url.split("/").pop()
    return {
      ...originalModel,
      model_url: "/static/webllm/models/" + modelId + "/",
      model_lib_url: "/static/webllm/wasm/" + wasmFileName,
    }
  }) as Model[]
}

export const downloadWebLLM = async (
  model: Model,
  signal: AbortSignal,
  cb?: (progress: number) => void
) => {
  const downloadModelFile = async (
    modelsDir: string[],
    name: string,
    baseUrl: string = model.model_url
  ) => {
    const isFileExist = await efsManager.checkFileExists([...modelsDir, name])
    if (isFileExist) {
      return await efsManager.getFile([...modelsDir, name])
    }
    const fileResp = await fetch(baseUrl + name, { signal })
    if (fileResp.ok) {
      const file = new File([await fileResp.blob()], name)
      await efsManager.addFile(modelsDir, file)
      return file
    }
    throw new Error("Failed to download model file")
  }

  // download wasm lib
  const wasmDir = ["static", "webllm", "wasm"]
  const name = model.model_lib_url.split("/").pop()
  downloadModelFile(wasmDir, name!, modelLibURLPrefix + modelVersion + "/")

  cb?.(0.03)
  // download model weights
  await efsManager.addDir(["static", "webllm", "models"], model.model_id)
  const modelsDir = ["static", "webllm", "models", model.model_id]

  const fileListJSONFile = await downloadModelFile(
    modelsDir,
    "ndarray-cache.json"
  )
  cb?.(0.04)
  const fileList = JSON.parse(await fileListJSONFile.text()) as ModelFileList
  const fileLists = ["mlc-chat-config.json", "tokenizer.json"]
  for (const file of fileLists) {
    await downloadModelFile(modelsDir, file)
  }
  cb?.(0.05)

  let downloadedBytes = 0
  for (const record of fileList.records) {
    await downloadModelFile(modelsDir, record.dataPath)
    downloadedBytes += record.nbytes
    cb?.(downloadedBytes / fileList.metadata.ParamBytes)
  }
}
