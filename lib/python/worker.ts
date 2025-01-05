// global singleton
let worker: Worker


export const getPythonWorker = () => {
    if (!worker) {
        worker = new Worker(
            new URL("@/worker/web-worker/pyodide/pyodide.ts", import.meta.url),
            {
                type: "module",
            }
        )
        // logger.info("load python worker") 
    }
    return worker
}

getPythonWorker()?.addEventListener('message', (event) => {
    if (event.data.type === 'PythonStdout') {
        console.log('Python:', event.data.data);
    } else if (event.data.type === 'PythonStderr') {
        console.error('Python Error:', event.data.data);
    }
});
