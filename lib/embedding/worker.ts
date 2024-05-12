let worker: Worker

export const getEmbeddingWorker = () => {
  if (!worker) {
    worker = new Worker(
      new URL("@/worker/web-worker/rag.ts", import.meta.url),
      {
        type: "module",
      }
    )
  }
  return worker
}

export const embeddingTexts = (texts: string[]) => {
  const worker = getEmbeddingWorker()
  const channel = new MessageChannel()
  return new Promise((resolve, reject) => {
    worker.postMessage({ texts }, [channel.port2])
    channel.port1.onmessage = (event) => {
      resolve(event.data)
    }
  })
}
