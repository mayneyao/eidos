import { uuidv4 } from "../utils"

export const recorderMap = new Map<string, Recorder>()

export class Recorder {
  chunks: BlobPart[]
  id: string
  mediaRecorder: MediaRecorder
  constructor() {
    this.id = uuidv4()
    this.chunks = []
    this.mediaRecorder = null as any
    recorderMap.set(this.id, this)
  }
  async start() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    })
    this.mediaRecorder = new MediaRecorder(stream, {
      bitsPerSecond: 24000000,
    })
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data)
      }
    }
    this.mediaRecorder.onstop = (e) => {
      console.log("recorder stopped")
      recorderMap.delete(this.id)
    }
    this.mediaRecorder.start(200)
    this.mediaRecorder.requestData() // Add this line
  }

  stop() {
    const blob = new Blob(this.chunks, { type: "video/mp4" })
    const url = URL.createObjectURL(blob)
    this.mediaRecorder.stop()
    this.mediaRecorder.stream.getTracks().forEach((track) => track.stop()) // Add this line
    return url
  }
}

// start a recorder
export const startRecorder = async (): Promise<string> => {
  const recorder = new Recorder()
  await recorder.start()
  return recorder.id
}

// stop a recorder and return a blob
export const stopRecorder = async (id: string): Promise<string | null> => {
  const recorder = recorderMap.get(id)
  if (recorder) {
    const fileUrl = recorder.stop()
    return fileUrl
  }
  return `cannot find recorder with id ${id}. maybe it has been stopped already`
}
