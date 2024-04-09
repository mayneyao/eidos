export const downloadFile = (file: Blob, name: string) => {
  const url = URL.createObjectURL(file)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
