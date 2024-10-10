// import { useRef, useState } from "react"
// import { MicRecorder } from "whisper-turbo"

// import { Button } from "@/components/ui/button"

// const SAMPLE_RATE = 16000

// interface MicButtonProps {
//   setAudioData: (audioData: Uint8Array) => void
// }

// export interface AudioMetadata {
//   file: File
//   fromMic: boolean
// }

// export const MicButton = (props: MicButtonProps) => {
//   const [mic, setMic] = useState<MicRecorder | null>(null)
//   const recordingRef = useRef(false)

//   const handleStop = async () => {
//     recordingRef.current = false
//     console.log("stopping mic...")
//     if (!mic) {
//       console.log("mic is null")
//       return
//     }
//     let recording = await mic.stop()
//     let ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
//     let resampled = await ctx.decodeAudioData(recording.buffer)
//     let ch0 = resampled.getChannelData(0)
//     props.setAudioData(new Uint8Array(ch0.buffer))
//     setMic(null)
//   }
//   const handleRecord = async () => {
//     recordingRef.current = true
//     const { recorder, stream } = await MicRecorder.start()
//     const audioContext = new AudioContext()
//     const source = audioContext.createMediaStreamSource(stream)
//     const analyser = audioContext.createAnalyser()
//     source.connect(analyser)
//     const data = new Uint8Array(analyser.frequencyBinCount)
//     setMic(recorder)
//     // let timerId: NodeJS.Timeout | null = null

//     // function checkAverage(average: number) {
//     //   if (average < 0.5) {
//     //     if (timerId === null) {
//     //       timerId = setTimeout(() => {
//     //         timerId = null
//     //         handleStop()
//     //       }, 2000)
//     //     }
//     //   } else {
//     //     if (timerId !== null) {
//     //       clearTimeout(timerId)
//     //       timerId = null
//     //     }
//     //   }
//     // }

//     function draw() {
//       analyser.getByteFrequencyData(data)
//       let sum = 0
//       for (let i = 0; i < data.length; i++) {
//         sum += data[i]
//       }
//       const average = sum / data.length
//       // checkAverage(average)
//       const circle = document.getElementById("circle")
//       if (circle) {
//         circle.style.width = `${average * 3}px`
//         // circle.style.height = `${average}px`
//         if (recordingRef.current) {
//           requestAnimationFrame(draw)
//         } else {
//           circle.style.width = `${0}px`
//           // circle.style.height = `${0}px`
//         }
//       }
//     }
//     draw()
//   }

//   // useKeyPress("s", (e) => {
//   //   if (e.shiftKey) {
//   //     handleClick()
//   //   }
//   // })
//   const handleClick = async () => {
//     if (recordingRef.current) {
//       await handleStop()
//     } else {
//       await handleRecord()
//     }
//   }

//   return (
//     <Button onClick={handleClick} variant="ghost" size="sm">
//       {recordingRef.current ? (
//         <svg
//           xmlns="http://www.w3.org/2000/svg"
//           viewBox="0 0 24 24"
//           fill="currentColor"
//           className="h-5 w-5"
//         >
//           <path
//             fillRule="evenodd"
//             d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z"
//             clipRule="evenodd"
//           />
//         </svg>
//       ) : (
//         <svg
//           xmlns="http://www.w3.org/2000/svg"
//           fill="none"
//           viewBox="0 0 24 24"
//           strokeWidth={1.5}
//           stroke="currentColor"
//           className="h-5 w-5"
//         >
//           <path
//             strokeLinecap="round"
//             strokeLinejoin="round"
//             d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
//           />
//         </svg>
//       )}
//     </Button>
//   )
// }
