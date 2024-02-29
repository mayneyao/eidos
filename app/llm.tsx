import { useEffect, useRef } from "react"
import * as webllm from "@mlc-ai/web-llm"

export function LlmChat() {
  const ref = useRef<webllm.ChatWorkerClient>()
  // Use a chat worker client instead of ChatModule here

  useEffect(() => {
    async function init() {
      if (ref.current) return
      const chat = new webllm.ChatWorkerClient(
        new Worker(
          new URL("@/worker/web-worker/web-llm/llm.ts", import.meta.url),
          {
            type: "module",
          }
        )
      )
      ref.current = chat

      // This callback allows us to report initialization progress
      chat.setInitProgressCallback((report: webllm.InitProgressReport) => {
        console.log("init-label", report.text)
      })
      // You can also try out "RedPajama-INCITE-Chat-3B-v1-q4f32_1"
      //   await chat.reload("Llama-2-7b-chat-hf-q4f32_1")
      await chat.reload("gemma-2b-it-q4f16_1", undefined, {
        model_list: [
          {
            model_url:
              "https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC/resolve/main/",
            local_id: "gemma-2b-it-q4f16_1",
            model_lib_url:
              "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it/gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm",
            vram_required_MB: 1476.52,
            low_resource_required: false,
            buffer_size_required_bytes: 262144000,
            required_features: ["shader-f16"],
          },
        ],
      })

      const request: webllm.ChatCompletionRequest = {
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "[INST] <<SYS>>\n\nYou are a helpful, respectful and honest assistant. " +
              "Be as happy as you can when speaking please.\n<</SYS>>\n\n ",
          },
          { role: "user", content: "Provide me three US states." },
          { role: "assistant", content: "California, New York, Pennsylvania." },
          { role: "user", content: "Two more please!" },
        ],
        n: 3,
        temperature: 1.5,
        max_gen_len: 25,
      }

      const reply0 = await chat.chatCompletion(request)
      console.log(reply0)

      console.log(await chat.runtimeStatsText())
      //   const generateProgressCallback = (_step: number, message: string) => {
      //     console.log("generate-label", message)
      //   }

      //   const prompt0 = "What is the capital of Canada?"
      //   console.log("prompt-label", prompt0)
      //   const reply0 = await chat.generate(prompt0, generateProgressCallback)
      //   console.log(reply0)
    }
    init()
  }, [])
  // everything else remains the same
  return <div>hi</div>
}
