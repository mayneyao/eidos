import type { ModelRecord } from "@mlc-ai/web-llm";

import {
  WEB_LLM_MODELS,
  modelLibURLPrefix,
  modelVersion,
} from "@/components/ai-chat/webllm/models";

import { efsManager } from "../storage/eidos-file-system";

import { LLMProvider } from "@/apps/web-app/settings/ai/store";
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

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

export const getLocalModelList = (modelIds: string[], origin: string) => {
  return modelIds.map((modelId) => {
    const originalModel = WEB_LLM_MODELS.find(
      (item) => item.model_id === modelId
    )
    const wasmFileName = originalModel?.model_lib.split("/").pop()

    return {
      ...originalModel,
      model: new URL("/static/webllm/models/" + modelId + "/", origin).href,
      model_lib: new URL("/static/webllm/wasm/" + wasmFileName, origin).href,
    }
  }) as ModelRecord[]
}

export const downloadWebLLM = async (
  model: Model,
  signal: AbortSignal,
  cb?: (progress: number) => void
) => {
  const downloadModelFile = async (
    modelsDir: string[],
    name: string,
    baseUrl: string = model.model + "/resolve/main/"
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
  const name = model.model_lib.split("/").pop()
  downloadModelFile(wasmDir, name!, modelLibURLPrefix + modelVersion + "/")

  cb?.(0.03)
  // download model weights
  await efsManager.addDir(["static", "webllm", "models"], model.model_id)
  const modelsDir = [
    "static",
    "webllm",
    "models",
    model.model_id,
    "resolve",
    "main",
  ]

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

export function getProvider(data: {
  apiKey?: string,
  baseUrl?: string,
  type?: LLMProvider['type']
}) {
  const { apiKey, baseUrl, type = 'openai' } = data
  const config: any = {
    apiKey
  }
  if (baseUrl) {
    config.baseUrl = baseUrl
  }
  switch (type) {
    case 'deepseek':
      return createDeepSeek(config)
    case 'groq':
      return createGroq(config)
    case 'openai':
      return createOpenAI(config)
    default:
      return createOpenAICompatible({
        baseURL: baseUrl,
        apiKey
      })
  }
}
