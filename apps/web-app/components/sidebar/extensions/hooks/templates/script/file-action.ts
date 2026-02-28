export const meta = {
  type: "fileAction",
  funcName: "copyFile",
  fileAction: {
    name: "Copy File",
    description: "Copy file to a new location",
    extensions: ["*"],
  },
}

export async function copyFile(
  { filePath }: { filePath: string },
  ctx: Record<string, any>
) {
  try {
    const content = await eidos.currentSpace.fs.readFile(filePath)

    const pathParts = filePath.split("/")
    const fileName = pathParts[pathParts.length - 1]
    const fileExt = fileName.includes(".") ? fileName.split(".").pop() : ""
    const baseName = fileExt ? fileName.slice(0, -fileExt.length - 1) : fileName

    const newFileName = `${baseName}_copy${fileExt ? "." + fileExt : ""}`
    pathParts[pathParts.length - 1] = newFileName
    const newFilePath = pathParts.join("/")

    await eidos.currentSpace.fs.writeFile(newFilePath, content)

    eidos.currentSpace.notify({
      title: "File Copied",
      description: `Copied ${fileName} to ${newFileName}`,
    })

    return {
      success: true,
      originalPath: filePath,
      newPath: newFilePath,
      message: `File copied successfully to ${newFileName}`,
    }
  } catch (error) {
    eidos.currentSpace.notify({
      title: "Copy Failed",
      description: `Failed to copy file: ${error.message}`,
    })

    return {
      success: false,
      error: error.message,
      message: `Failed to copy file: ${error.message}`,
    }
  }
}
