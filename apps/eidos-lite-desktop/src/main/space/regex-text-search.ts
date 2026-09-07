import { Worker } from "node:worker_threads"

/** Untrusted patterns run off the main thread and can be terminated mid-match. */
export function regexTextMatches(
  content: string,
  query: string,
  limit: number,
  caseSensitive: boolean,
  wholeWord: boolean,
  signal: AbortSignal
): Promise<{ start: number; end: number }[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      resolve([])
      return
    }
    const worker = new Worker(
      `
      const {parentPort, workerData: d} = require('node:worker_threads');
      try {
        const matches = [];
        for (const m of d.content.matchAll(new RegExp(d.query, d.caseSensitive ? 'gu' : 'giu'))) {
          if (!m[0].length) continue;
          if (m[0].length > 4096) throw new Error('Regular expression matched too much text. Use a more specific pattern.');
          if (d.wholeWord && (/[\\p{L}\\p{N}\\p{M}_]$/u.test(d.content.slice(Math.max(0, m.index - 2), m.index)) || /^[\\p{L}\\p{N}\\p{M}_]/u.test(d.content.slice(m.index + m[0].length, m.index + m[0].length + 2)))) continue;
          matches.push({start:m.index,end:m.index+m[0].length});
          if(matches.length>=d.limit) break;
        }
        parentPort.postMessage({matches});
      } catch(error) { parentPort.postMessage({error: error.message}); }
    `,
      {
        eval: true,
        workerData: { content, query, limit, caseSensitive, wholeWord },
      }
    )
    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      void worker.terminate()
    }
    const fail = (message: string) => {
      cleanup()
      const error = new Error(message)
      error.name = "RegexSearchError"
      reject(error)
    }
    const abort = () => {
      cleanup()
      resolve([])
    }
    const timer = setTimeout(
      () => fail("Regular expression took too long. Simplify the pattern."),
      500
    )
    signal.addEventListener("abort", abort, { once: true })
    worker.once(
      "message",
      (result: {
        matches?: { start: number; end: number }[]
        error?: string
      }) => {
        if (result.error) fail(result.error)
        else {
          cleanup()
          resolve(result.matches ?? [])
        }
      }
    )
    worker.once("error", (error) => fail(error.message))
  })
}
