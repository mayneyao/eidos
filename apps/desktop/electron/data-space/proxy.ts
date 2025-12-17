import type { DataSpace } from "@/packages/core/data-space";
import type { RpcRequest, RpcResponse } from "./rpc-types";

export function createDataSpaceProxy(
  send: (req: RpcRequest) => Promise<RpcResponse>
): DataSpace {
  const handler: ProxyHandler<any> = {
    get(target, prop, receiver) {
        // Special props
        if (prop === 'then') return undefined; // Make sure it's not treated as a Promise
        if (prop === 'toJSON') return () => ({ type: 'DataSpaceProxy' });

        // Add execute payload method to the root proxy
        if (prop === '_executePayload') {
          return async (payload: { method: string; params: any[]; space: string; dbName: string; userId: string }) => {
            const requestId = Math.random().toString(36).substring(2);
            const req: RpcRequest = {
              id: requestId,
              type: 'execute-payload',
              payload
            };

            console.log("====== send execute-payload request ======")
            console.log("Request payload:", req.payload)
            console.log("Full request:", req)
            const resp = await send(req);
            if (resp.error) {
                throw new Error(resp.error.message);
            }
            console.log("====== execute-payload result ======")
            console.log("Result type:", typeof resp.result)
            console.log("Result constructor:", resp.result?.constructor?.name)
            try {
                // Try to serialize to see if it can be cloned
                const serialized = JSON.stringify(resp.result)
                console.log("Result can be JSON serialized, length:", serialized.length)
            } catch (e: any) {
                console.log("Result cannot be JSON serialized:", e?.message || String(e))
                console.log("Result keys:", Object.keys(resp.result || {}))
                // Try to inspect the object more deeply
                if (resp.result && typeof resp.result === 'object') {
                    const inspectObj = (obj: any, depth = 0, maxDepth = 3): any => {
                        if (depth > maxDepth) return "[Max depth reached]"
                        if (obj === null) return null
                        if (typeof obj !== 'object') return obj

                        const result: any = {}
                        for (const key in obj) {
                            try {
                                const value = obj[key]
                                if (typeof value === 'function') {
                                    result[key] = "[Function]"
                                } else if (typeof value === 'object' && value !== null) {
                                    result[key] = inspectObj(value, depth + 1, maxDepth)
                                } else {
                                    result[key] = value
                                }
                            } catch (e: any) {
                                result[key] = `[Error accessing property: ${e?.message || String(e)}]`
                            }
                        }
                        return result
                    }
                    console.log("Result inspection:", inspectObj(resp.result))
                }
            }
            return resp.result;
          };
        }

        // If it's a known property on the target (like hardcoded mocks), return it?
        // But we want to proxy everything.
        // We accumulate the path.

        return createProxyLevel(send, [prop as string]);
    }
  };

  // We cast to DataSpace, but at runtime it's a Proxy
  return new Proxy({}, handler) as DataSpace;
}

function createProxyLevel(
    send: (req: RpcRequest) => Promise<RpcResponse>,
    path: string[]
): any {
    const handler: ProxyHandler<any> = {
        get(target, prop, receiver) {
            if (prop === 'then') return undefined;
            return createProxyLevel(send, [...path, prop as string]);
        },
        apply(target, thisArg, argArray) {
            const requestId = Math.random().toString(36).substring(2);
            const req: RpcRequest = {
                id: requestId,
                type: 'call',
                path: path,
                args: argArray
            };
            
            console.log("====== send request ======")
            console.log(req)
            return send(req).then(resp => {
                if (resp.error) {
                    throw new Error(resp.error.message);
                }
                console.log("====== proxy result ======")
                console.log("Result type:", typeof resp.result)
                console.log("Result constructor:", resp.result?.constructor?.name)
                try {
                    // Try to serialize to see if it can be cloned
                    const serialized = JSON.stringify(resp.result)
                    console.log("Result can be JSON serialized, length:", serialized.length)
                } catch (e: any) {
                    console.log("Result cannot be JSON serialized:", e?.message || String(e))
                    console.log("Result keys:", Object.keys(resp.result || {}))
                    // Try to inspect the object more deeply
                    if (resp.result && typeof resp.result === 'object') {
                        const inspectObj = (obj: any, depth = 0, maxDepth = 3): any => {
                            if (depth > maxDepth) return "[Max depth reached]"
                            if (obj === null) return null
                            if (typeof obj !== 'object') return obj

                            const result: any = {}
                            for (const key in obj) {
                                try {
                                    const value = obj[key]
                                    if (typeof value === 'function') {
                                        result[key] = "[Function]"
                                    } else if (typeof value === 'object' && value !== null) {
                                        result[key] = inspectObj(value, depth + 1, maxDepth)
                                    } else {
                                        result[key] = value
                                    }
                                } catch (e: any) {
                                    result[key] = `[Error accessing property: ${e?.message || String(e)}]`
                                }
                            }
                            return result
                        }
                        console.log("Result inspection:", inspectObj(resp.result))
                    }
                }
                return resp.result;
            });
        }
    };
    return new Proxy(() => {}, handler);
}
