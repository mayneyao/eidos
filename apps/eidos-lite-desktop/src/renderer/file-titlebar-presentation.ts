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
  pendingDocumentPath: string | null,
  editor?: { documentPath: string; label: string } | null
): FileTitlebarPresentation {
  const documentPath = pendingDocumentPath ?? activeDocumentPath
  const name = documentPath ? fileName(documentPath) : spaceName
  const title =
    documentPath &&
    !pendingDocumentPath &&
    editor?.documentPath === documentPath &&
    editor.label
      ? `${editor.label}:\\${name}`
      : name
  return {
    documentPath,
    title,
    pending: pendingDocumentPath !== null,
  }
}
