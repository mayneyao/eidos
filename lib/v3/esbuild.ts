import { initialize } from "esbuild-wasm";


export let compilerInitialized = false
export const initializeCompiler = async () => {
    if (compilerInitialized) return
    try {
        await initialize({
            worker: true,
            wasmURL: "https://esm.sh/esbuild-wasm@0.24.0/esbuild.wasm",
        });
    } catch (error) {
        console.error(error)
        compilerInitialized = false
    }
    compilerInitialized = true
};

export { transform } from "esbuild-wasm";