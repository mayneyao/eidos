export interface FileTitlebarPresentation {
  documentPath: string | null
  title: string
  pending: boolean
}

function fileName(relativePath: string): string {
  return relativePath.split("/").at(-1) ?? relativePath
}

export function fileTitlebarPresentation(
  spaceName: string,
  activeDocumentPath: string | null,
  pendingDocumentPath: string | null
): FileTitlebarPresentation {
  const documentPath = pendingDocumentPath ?? activeDocumentPath
  const title = documentPath ? fileName(documentPath) : spaceName
  return {
    documentPath,
    title,
    pending: pendingDocumentPath !== null,
  }
}
