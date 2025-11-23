import type { FeatureExtractionPipeline } from "@xenova/transformers";
import { env, pipeline } from "@xenova/transformers"


let instance: FeatureExtractionPipeline | null = null

async function checkLocalModelIsExist(model: string) {
  return false
}

async function getInstances(): Promise<FeatureExtractionPipeline> {
  if (!instance) {
    const model = "Xenova/bge-m3"
    const isExist = await checkLocalModelIsExist(model)
    if (!isExist) {
      env.allowLocalModels = false
      env.localModelPath = `/static/transformers`
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
