import { FeatureExtractionPipeline, env, pipeline } from "@xenova/transformers"

env.allowLocalModels = false

let instance: FeatureExtractionPipeline | null = null

async function getInstances(): Promise<FeatureExtractionPipeline> {
  if (!instance) {
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
