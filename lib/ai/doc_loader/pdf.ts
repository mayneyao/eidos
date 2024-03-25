import { efsManager } from "@/lib/storage/eidos-file-system"

const getPdfjs = async () => {
  const pdfjs = await import("pdfjs-dist")
  // @ts-ignore
  const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.entry")
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker
  return pdfjs
}

const document = {
  fonts: self.fonts,
  createElement: (name: string) => {
    if (name == "canvas") {
      return new OffscreenCanvas(1, 1)
    }
    return null
  },
}

export async function pdfLoader(file: File) {
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({
    data: arrayBuffer,
    ownerDocument: document as any,
  }).promise
  const pages = []
  for (let i = 0; i < pdf.numPages; i++) {
    const pageNum = i + 1
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    if (content.items.length === 0) {
      continue
    }
    const text: string = content.items.map((item: any) => item.str).join("\n")
    pages.push({
      content: text,
      meta: {
        pageNum,
        filename: file.name,
      },
    })
  }
  return pages
}

export class PDFLoader {
  async load(path: string): Promise<any[]> {
    const file = await efsManager.getFileByPath(path)
    const pages = await pdfLoader(file)
    console.log("pages", pages)
    return pages
  }
}
