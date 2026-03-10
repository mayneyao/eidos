export const meta = {
  type: "relayHandler",
  funcName: "handleRelayMessages",
  relayHandler: {
    name: "Process Relay Messages",
    description: "Processes incoming messages from Relay channels",
  },
}

export async function handleRelayMessages(batch: {
  messages: Array<{
    id: string
    body: any
    timestamp: number
    metadata?: any
  }>
}) {
  for (const message of batch.messages) {
    try {
      const { body } = message
      console.log("Processing message:", message.id, body)

      // TODO: Add your message processing logic here
      // Example: Save to a table
      // await eidos.currentSpace._table("messages").rows.create({
      //   content: JSON.stringify(body),
      //   received_at: new Date(message.timestamp).toISOString(),
      // })

      // Messages are automatically acknowledged if no error is thrown
    } catch (error) {
      console.error("Failed to process message:", message.id, error)
      // Throwing an error will cause all unprocessed messages to be retried
      throw error
    }
  }

  return {
    processed: batch.messages.length,
  }
}
