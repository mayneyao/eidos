// import { useEffect, useMemo, useRef, useState } from "react"
// import {
//   AvailableModels,
//   DecodingOptionsBuilder,
//   InferenceSession,
//   Segment,
//   SessionManager,
//   Task,
//   initialize,
// } from "whisper-turbo"

// import { useAIChatSettingsStore } from "../settings/ai-chat-settings-store"

// // export const useCloudflareWhisper = () => {
// //   const runWhisper = async (audioData: Uint8Array) => {
// //     const response = await fetch(`https://speech2text.gine.workers.dev/`, {
// //       method: "POST",
// //       headers: {
// //         "Content-Type": "audio/wav",
// //       },
// //       body: audioData,
// //     })
// //     const data = await response.json()
// //     return data
// //   }

// //   return { runWhisper }
// // }

// export const useWebGPUWhisper = ({
//   setText,
//   setLoading,
// }: {
//   setText: (text: string) => void
//   setLoading: (loading: boolean) => void
// }) => {
//   const sessionRef = useRef<InferenceSession>()
//   const [hasWebGPU, setHasWebGPU] = useState(false)
//   const { sourceLanguage } = useAIChatSettingsStore()
//   const [hasInitialized, setHasInitialized] = useState(false)

//   const canUse = useMemo(() => {
//     return hasWebGPU && hasInitialized
//   }, [hasInitialized, hasWebGPU])
//   useEffect(() => {
//     async function init() {
//       if (!hasInitialized) {
//         await initialize()
//         setHasInitialized(true)
//       }
//     }
//     init()
//     if ((navigator as any).gpu) {
//       setHasWebGPU(true)
//     } else {
//       setHasWebGPU(false)
//     }
//   }, [hasInitialized, hasWebGPU, setHasWebGPU])

//   const runWhisper = async (audioData: Uint8Array) => {
//     if (!sessionRef.current) {
//       const session = await new SessionManager().loadModel(
//         AvailableModels.WHISPER_SMALL,
//         () => {
//           console.log("Model loaded successfully")
//         },
//         (p: number) => {
//           console.log(`Loading: ${p}%`)
//         }
//       )
//       if (session.isOk) {
//         sessionRef.current = session.value
//       }
//     }

//     let options = new DecodingOptionsBuilder()
//       .setLanguage(sourceLanguage)
//       .setSuppressBlank(true)
//       .setMaxInitialTimestamp(1)
//       .setTemperature(0)
//       .setSuppressTokens(Int32Array.from([-1]))
//       .setTask(Task.Transcribe)
//       .build()
//     if (sessionRef.current && audioData) {
//       let text = ""
//       setLoading(true)
//       await sessionRef.current.transcribe(
//         audioData,
//         true,
//         options,
//         (segment: Segment) => {
//           console.log("Segment: ", segment)
//           text += segment.text
//           if (segment.last) {
//             setLoading(false)
//             setText(text)
//           }
//         }
//       )
//     }
//   }

//   return {
//     runWhisper,
//     hasWebGPU,
//     canUse,
//   }
// }
