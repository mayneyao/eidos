import { FeatureExtractionPipeline, env, pipeline } from "@xenova/transformers"

import { efsManager } from "@/lib/storage/eidos-file-system"

let instance: FeatureExtractionPipeline | null = null

async function checkLocalModelIsExist(model: string) {
  return await efsManager.checkFileExists([
    "static",
    "transformers",
    ...model.split("/"),
    "config.json",
  ])
}

async function getInstances(): Promise<FeatureExtractionPipeline> {
  if (!instance) {
    const model = "Xenova/bge-m3"
    const isExist = await checkLocalModelIsExist(model)
    if (!isExist) {
      env.allowLocalModels = false
      console.log(
        "Model not found in local storage, downloading from Hugging Face"
      )
    } else {
      console.log("Model found in local storage")
      env.allowLocalModels = true
      env.localModelPath = `/static/transformers`
    }
    instance = await pipeline("feature-extraction", "Xenova/bge-m3", {
      progress_callback: (x: {
        status: string
        task: string
        model: string
      }) => {
        self.postMessage(x)
      },
    })
  }
  return instance
}

self.addEventListener("message", async (event) => {
  let extractor = await getInstances()
  const embeddings = await extractor(event.data.texts, {
    pooling: "cls",
    normalize: true,
  })
  event.ports[0].postMessage(embeddings.tolist())
})
