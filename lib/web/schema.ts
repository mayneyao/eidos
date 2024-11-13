export const openCursor = (filePath: string) => {
    return `cursor://file/${filePath}?windowId=_blank`
}

export const openVscode = (filePath: string) => {
    return `vscode://file/${filePath}?windowId=_blank`
}