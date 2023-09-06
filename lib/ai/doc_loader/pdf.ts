import { opfsManager } from "@/lib/opfs"
import { pdfLoader } from "@/lib/pdf"

export class PDFLoader {
  async load(path: string): Promise<any[]> {
    const file = await opfsManager.getFileByPath(path)
    const pages = await pdfLoader(file)
    console.log("pages", pages)
    return pages
  }
}
