import { getDocumentProxy, extractText } from 'unpdf';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js global worker and CMap resources
const PDFJS_WORKER_URL = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
);

const PDFJS_CMAP_URL = new URL(
  'pdfjs-dist/cmaps/',
  import.meta.url
);

pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL.toString();

export async function pdfToMarkdown(pdfFile: File | Blob): Promise<string> {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await getDocumentProxy(arrayBuffer, {
        cMapUrl: PDFJS_CMAP_URL.toString(),
        cMapPacked: true,
    });
    const markdown = await extractText(pdf);
    return markdown.text.join(' ');
}