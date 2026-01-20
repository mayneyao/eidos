/**
 * HTTP Transport for Eidos RPC client
 * Extracted and adapted from packages/sandbox/src/sdk-inject-script.html
 */

export interface TransportConfig {
  endpoint: string
  timeout?: number
  fetch?: typeof fetch
}

export interface TransportPort {
  onmessage: ((event: { data: any }) => void) | null
  close: () => void
}

/**
 * Create HTTP transport for RPC calls
 */
export function createHttpTransport(config: TransportConfig) {
  const { endpoint, timeout = 30000 } = config
  const fetchFn = config.fetch || globalThis.fetch
  
  return {
    send: async (requestData: any): Promise<TransportPort> => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      try {
        const response = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)
        
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`)
        }
        
        const jsonData = await response.json()
        
        if (!jsonData.success) {
          throw new Error(jsonData.error || 'RPC call failed')
        }
        
        const responseData = jsonData.data
        
        // Create simulated port for callback compatibility
        const simulatedPort: TransportPort = {
          onmessage: null,
          close: () => {},
        }
        
        // Async callback
        setTimeout(() => {
          if (simulatedPort.onmessage) {
            simulatedPort.onmessage({
              data: { type: 'rpcCallResp', data: responseData },
            })
          }
        }, 0)
        
        return simulatedPort
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    },
    close: () => {},
  }
}

/**
 * Wait for callback from transport port
 */
export function onCallBack(port: TransportPort): Promise<any> {
  return new Promise((resolve, reject) => {
    port.onmessage = (event) => {
      port.close()
      const { type, data } = event.data
      if (type === 'rpcCallResp') {
        resolve(data)
      } else {
        reject(new Error('RPC call failed'))
      }
    }
  })
}
