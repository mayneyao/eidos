import type { PyodideInterface } from 'pyodide';
import { loadPyodide } from 'pyodide';
import type { PyProxy } from 'pyodide/ffi';


declare const self: Worker


export interface IPythonScriptCallProps {
    input: Record<string, any>
    context: {
        tables: any
        env: Record<string, any>
        currentNodeId?: string | null
        currentRowId?: string | null
        currentViewId?: string | null
        currentViewQuery?: string | null
        callFromTableAction?: boolean
    }
    code: string
    command: string
    id: string
    bindings?: Record<string, any>
    dependencies?: string[]
}

interface PyodideMessage {
    type: 'PythonScriptCall' | 'PythonScriptInstall'
    payload: IPythonScriptCallProps;
}

type PyodideResponseType = 'PythonScriptCallResponse' | 'PythonScriptCallError'
interface PyodideResponse {
    type: PyodideResponseType;
    result?: any;
    error?: string;
    time?: number;
}

interface PyodideConfig {
    preloadPackages?: string[];
}

let pyodide: PyodideInterface
async function loadPyodideAndPackages(config?: PyodideConfig): Promise<PyodideInterface> {
    pyodide = await loadPyodide({
        indexURL: "https://testingcf.jsdelivr.net/pyodide/v0.27.0/full/",
        fullStdLib: false,
        stdout: (text: string) => {
            self.postMessage({
                type: 'PythonStdout',
                data: text
            });
        },
        stderr: (text: string) => {
            self.postMessage({
                type: 'PythonStderr',
                data: text
            });
        }
    })
    const dirHandle = await navigator.storage.getDirectory()
    const permissionStatus = await dirHandle.requestPermission({
        mode: "readwrite",
    });

    if (permissionStatus !== "granted") {
        throw new Error("readwrite access to directory not granted");
    }
    const nativefs = await pyodide.mountNativeFS("/mount_dir", dirHandle);

    await pyodide.loadPackage('micropip')

    if (config?.preloadPackages?.length) {
        const micropip = pyodide.pyimport('micropip')
        await Promise.all(config.preloadPackages.map(pkg => micropip.install(pkg)))

        for (const pkg of config.preloadPackages) {
            try {
                pyodide.pyimport(pkg)
            } catch (error) {
                console.warn(`Failed to import preloaded package ${pkg}:`, error)
            }
        }
    }

    return pyodide
}

const getPyodide = async (config?: PyodideConfig): Promise<PyodideInterface> => {
    if (!pyodide) {
        pyodide = await loadPyodideAndPackages(config)
    }
    return pyodide
}

self.onmessage = async (event: MessageEvent<PyodideMessage>) => {
    const port = event.ports[0]
    if (!port) {
        console.error('No port provided')
        return
    }

    try {
        const pyodide = await getPyodide()
        const { type, payload } = event.data
        const startTime = Date.now()

        switch (type) {
            case 'PythonScriptInstall': {
                if (!payload.dependencies || !payload.dependencies.length) {
                    throw new Error('No packages specified for installation')
                }
                const micropip = pyodide.pyimport('micropip')

                const installResults = await Promise.all(payload.dependencies.map(async pkg => {
                    try {
                        try {
                            pyodide.pyimport(pkg);
                            return `${pkg} (already loaded)`;
                        } catch {
                            await micropip.install(pkg);
                            return `${pkg} (installed)`;
                        }
                    } catch (error) {
                        return `${pkg} (failed: ${(error as Error).message || 'Unknown error'})`;
                    }
                }));
                port.postMessage({
                    type: 'PythonScriptCallResponse',
                    data: {
                        result: `Package installation results:\n${installResults.join('\n')}`,
                        time: Date.now() - startTime,
                    }
                });
                break;
            }

            case 'PythonScriptCall': {
                if (!payload.code) {
                    throw new Error('No code provided for execution')
                }

                await pyodide.loadPackagesFromImports(payload.code, {
                    messageCallback: (message) => {
                        self.postMessage({
                            type: 'PythonStdout',
                            data: message
                        });
                    },
                    errorCallback: (error) => {
                        self.postMessage({
                            type: 'PythonStderr',
                            data: error
                        });
                    }
                });

                if (payload.dependencies?.length) {
                    const micropip = pyodide.pyimport('micropip');
                    await micropip.install(payload.dependencies);
                }

                let code = payload.code
                let result: PyProxy
                await pyodide.runPythonAsync(code)
                try {
                    const callName = payload.command || 'main'
                    const func = pyodide.globals.get(callName)
                    if (typeof func === 'function') {
                        if (callName === 'main') {
                            result = await func(payload.input, payload.context)
                        } else {
                            result = await func()
                        }
                    } else {
                        result = func
                    }
                } catch (error) {
                    throw new Error(`Command '${payload.command}' not found or not callable`)
                }

                let jsResult;
                try {
                    if (result) {
                        jsResult = result.toJs({
                            dict_converter: Object.fromEntries,
                            create_pyproxies: false
                        })
                        console.log('jsResult', jsResult, result)
                    } else {
                        jsResult = result;
                    }
                } catch (error) {
                    console.warn('Failed to convert Python result to JS:', error);
                    jsResult = String(result);
                }

                console.log({
                    jsResult,
                    result
                })
                try {
                    JSON.parse(JSON.stringify(jsResult));
                } catch (error) {
                    console.warn('Result cannot be serialized, converting to string:', error);
                    jsResult = String(jsResult);
                }

                console.log('Final result:', jsResult);
                port.postMessage({
                    type: 'PythonScriptCallResponse',
                    data: {
                        result: jsResult,
                        time: Date.now() - startTime
                    }
                });

                if (typeof result.destroy === 'function') {
                    result.destroy()
                }
                break;
            }

            default:
                throw new Error(`Unknown message type: ${type}`)
        }
    }
    catch (error) {
        port.postMessage({
            type: 'PythonScriptCallError',
            data: {
                error: (error as Error).message || 'Execution error'
            }
        });
    }
}

// loadPyodideAndPackages({
//     preloadPackages: ['pdfminer.six']
// })