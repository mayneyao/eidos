// worker.ts
import { MLCEngine, MLCEngineWorkerHandler } from "@mlc-ai/web-llm"

// Hookup an MLCEngine to a worker handler
const engine = new MLCEngine()
const handler = new MLCEngineWorkerHandler(engine)
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg)
}
