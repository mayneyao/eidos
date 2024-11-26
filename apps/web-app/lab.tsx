import { fileChecksum } from "@/lib/web/crypto"
import { CommandInputEditor } from "@/components/command-editor/Editor"

export const LabPage = () => {
  // fileChecksum
  const handleFileUpload = async (file?: File) => {
    if (!file) {
      return
    }

    // time it takes to calculate the hash
    console.time("fileChecksum")
    const hash = await fileChecksum(file)
    console.timeEnd("fileChecksum")
    console.log("File hash:", hash)
  }

  return (
    <div>
      <CommandInputEditor />

      <input
        type="file"
        onChange={(e) => handleFileUpload(e.target.files?.[0])}
      />
    </div>
  )
}
