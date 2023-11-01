import { useEffect } from "react"

export const useLaunchQueue = () => {
  async function handleFile(fh: FileSystemFileHandle) {
    const file = await fh.getFile()
    const text = await file.text()
    console.log(text)
  }
  useEffect(() => {
    if ("launchQueue" in window) {
      console.log("hi")
      ;(window as any).launchQueue.setConsumer((launchParams: any) => {
        console.log(launchParams)
        if (launchParams.files && launchParams.files.length) {
          const file = launchParams.files[0]
          console.log(file)
          handleFile(file)
        }
      })
    }
  }, [])
  return {}
}
