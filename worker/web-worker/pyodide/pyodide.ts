import { IPythonScriptCallProps } from '@/components/script-container/helper';
import { loadPyodide, PyodideInterface } from 'pyodide'
import { analyzePythonImports } from './analyze-imports';


declare const self: Worker

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

// 添加预加载包的配置类型
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

    // 使用 CDN 版本的 micropip
    await pyodide.loadPackage('micropip')

    // 预加载指定的包
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
                
                // 使用导入的分析函数
                const imports = await analyzePythonImports(pyodide, payload.code)
                console.log('Detected imports:', imports)
                
                // Combine explicit dependencies with detected third-party imports
                const allDependencies = new Set([
                    ...(payload.dependencies || []),
                    ...(imports.thirdParty || [])
                ])
                
                // Install all required packages
                if (allDependencies.size > 0) {
                    const micropip = pyodide.pyimport('micropip')
                    await Promise.all([...allDependencies].map(async pkg => {
                        try {
                            try {
                                pyodide.pyimport(pkg)
                                console.log(`Package ${pkg} already loaded`)
                            } catch {
                                await micropip.install(pkg)
                                console.log(`Package ${pkg} installed`)
                            }
                        } catch (error) {
                            console.warn(`Failed to install package ${pkg}:`, error)
                        }
                    }))
                }

                let code = payload.code
                const hasMainFunction = /^\s*def\s+main\s*\(/m.test(code)
                if (hasMainFunction) {
                    code = `${code}\nmain`
                }

                const main = await pyodide.runPythonAsync(code)

                let result
                if (hasMainFunction) {
                    result = await main(payload.input, payload.context);
                } else {
                    result = main;
                }

                console.log(result)
                port.postMessage({
                    type: 'PythonScriptCallResponse',
                    data: {
                        result: result.toString(),
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

loadPyodideAndPackages({
    preloadPackages: ['pdfminer.six']
})