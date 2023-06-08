import type { SqlDatabase } from '@/worker/sql';
import { useEffect, useState } from 'react';

const worker = new Worker(new URL('../worker/sql.ts', import.meta.url), { type: 'module' })

let id = 0;

const SQLWorker = new Proxy<SqlDatabase>({} as any, {
  get(target, method) {
    const thisCallId = ++id;
    return function (params: any) {
      const [_params, ...rest] = arguments
      worker.postMessage({ method, params: [_params, ...rest], id: thisCallId })
      return new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          const { id: returnId, result } = e.data
          if (returnId === thisCallId) {
            resolve(result)
          }
        }
      })
    }
  }
})

export const useSqlite = () => {
  const [isInit, setIsInit] = useState(false)
  const [sqlite, setSqlite] = useState<SqlDatabase | null>(null)
  useEffect(() => {
    worker.onmessage = (e) => {
      if (e.data === 'init') {
        setIsInit(true)
        setSqlite(SQLWorker)
      }
    }
  }, [])

  if (!isInit) {
    return null
  }
  return sqlite
}