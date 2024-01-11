declare var self: ServiceWorkerGlobalScope

export async function queryEmbedding(data: {
  query: string
  model: string
  scope: string
  k?: number
  provider: {
    name: "openai"
    token: string
  }
}): Promise<any[]> {
  const channel = new MessageChannel()
  let cls = await self.clients.matchAll()
  console.log(cls)
  cls[0].postMessage(
    {
      type: "queryEmbedding",
      data,
    },
    [channel.port2]
  )
  return new Promise((resolve) => {
    channel.port1.onmessage = (event) => {
      resolve(event.data)
      channel.port1.close()
    }
  })
}
