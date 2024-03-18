import { useEffect, useState } from "react"

export const useLaunchQueue = () => {
  const [rowText, setRowText] = useState("")
  async function handleFile(fh: FileSystemFileHandle) {
    const file = await fh.getFile()
    const text = await file.text()
    setRowText(text)
  }
  useEffect(() => {
    if ("launchQueue" in window) {
      ;(window as any).launchQueue.setConsumer((launchParams: any) => {
        if (launchParams.files && launchParams.files.length) {
          const file = launchParams.files[0]
          handleFile(file)
        }
      })
    }
  }, [])
  return {
    rowText,
  }
}
