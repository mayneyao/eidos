// import { useState } from "react"

// import { Button } from "@/components/ui/button"
// import { Loading } from "@/components/loading"

// import { useWebGPUWhisper } from "./hooks"
// import { MicButton } from "./recorder"

// interface IWhisperProps {
//   setText: (text: string) => void
// }

// export const Whisper = ({ setText }: IWhisperProps) => {
//   const [loading, setLoading] = useState(false)
//   const { runWhisper, hasWebGPU, canUse } = useWebGPUWhisper({
//     setText,
//     setLoading,
//   })
//   // const { runWhisper } = useCloudflareWhisper()
//   if (!hasWebGPU) {
//     return null
//   }
//   return (
//     <>
//       {loading && <Loading />}
//       {canUse ? (
//         <MicButton setAudioData={runWhisper} />
//       ) : (
//         <Button variant="ghost" size="sm" disabled>
//           <svg
//             xmlns="http://www.w3.org/2000/svg"
//             fill="none"
//             viewBox="0 0 24 24"
//             strokeWidth={1.5}
//             stroke="currentColor"
//             className="h-5 w-5"
//           >
//             <path
//               strokeLinecap="round"
//               strokeLinejoin="round"
//               d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
//             />
//           </svg>
//         </Button>
//       )}
//     </>
//   )
// }

// export default Whisper