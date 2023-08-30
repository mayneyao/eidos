export class PDFLoader {
  async load(fileUrl: string): Promise<any[]> {
    console.log(fileUrl)
    const channel = new MessageChannel()
    postMessage(
      {
        type: "loadPdf",
        data: {
          fileUrl,
        },
      },
      [channel.port2]
    )
    const pages: any[] = await new Promise((resolve) => {
      channel.port1.onmessage = (e) => {
        console.log("pdf loader", e.data)
        resolve(e.data)
      }
    })
    console.log("pages", pages)
    return pages
  }
}
