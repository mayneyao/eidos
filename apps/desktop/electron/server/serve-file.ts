import { lookup } from '@/lib/mime/mime';
import type { ReadStream } from 'fs';
import fs from 'fs';


// Helper to create ReadableStream from Node stream (needed by Hono)
export const createStreamBody = (stream: ReadStream) => {
    const body = new ReadableStream({
        start(controller) {
            stream.on('data', (chunk) => {
                controller.enqueue(chunk)
            })
            stream.on('end', () => {
                controller.close()
            })
            stream.on('error', (err) => {
                console.error('Error reading file stream:', err)
                controller.error(err)
            })
        },
        cancel() {
            stream.destroy()
        },
    })
    return body
}


export async function serveFile(filePath: string, c: any) {
    try {
        if (!fs.existsSync(filePath)) {
            return c.text('File not found', 404);
        }

        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
            return c.text('Not a file', 400);
        }

        const mimeType = lookup(filePath) as string || 'application/octet-stream';
        if (mimeType) {
            c.header('Content-Type', mimeType);
        }
        c.header('Cross-Origin-Embedder-Policy', 'require-corp');
        c.header('Cross-Origin-Resource-Policy', 'cross-origin');
        c.header('Accept-Ranges', 'bytes');

        const size = stat.size;

        if (c.req.method === 'HEAD') {
            c.header('Content-Length', size.toString());
            return c.body(null, 200);
        }

        const rangeHeader = c.req.header('range');
        if (rangeHeader && rangeHeader.startsWith('bytes=')) {
            const range = rangeHeader.replace(/bytes=/, '').split('-', 2);
            const startStr = range[0];
            const endStr = range[1];

            const start = startStr ? parseInt(startStr, 10) : 0;
            let end = endStr ? parseInt(endStr, 10) : size - 1;

            if (isNaN(start) || isNaN(end) || start < 0 || end < 0 || start > end || start >= size) {
                c.header('Content-Range', `bytes */${size}`);
                return c.body('Range Not Satisfiable', 416);
            }

            if (end >= size) {
                end = size - 1;
            }

            const chunkSize = end - start + 1;
            const stream = fs.createReadStream(filePath, { start, end });

            c.header('Content-Length', chunkSize.toString());
            c.header('Content-Range', `bytes ${start}-${end}/${size}`);

            return c.body(createStreamBody(stream), 206);
        }

        c.header('Content-Length', size.toString());
        const stream = fs.createReadStream(filePath);
        return c.body(createStreamBody(stream), 200);
    } catch (error: any) {
        return c.text(`Error serving file: ${error.message}`, 500);
    }
}
