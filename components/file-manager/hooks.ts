import { useIndexedDB } from "@/hooks/use-indexed-db"

export const useExternalFolder = () => {
  const [externalFolders, setExternalFolders] = useIndexedDB<
    FileSystemDirectoryHandle[]
  >("kv", "externalFolders", [])

  const handleSelectExternalFolder = async () => {
    const dirHandle = await window.showDirectoryPicker()
    // store this dirHandle to indexedDB
    setExternalFolders([...externalFolders, dirHandle])
    if (dirHandle) {
      await dirHandle.requestPermission({
        mode: "readwrite",
      })
    }
  }

  return {
    externalFolders,
    handleSelectExternalFolder,
  }
}
