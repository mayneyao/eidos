/**
 * HTTP Transport for Eidos RPC client
 * Extracted and adapted from packages/sandbox/src/sdk-inject-script.html
 */

export interface TransportConfig {
  endpoint: string
  timeout?: number
  fetch?: typeof fetch
  apiKey?: string
}

export interface TransportPort {
  onmessage: ((event: { data: any }) => void) | null
  close: () => void
}

import { containsBinaryData, processBinaryData, restoreBinaryData } from './binary-data'

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
        let body: any
        let headers: Record<string, string> = {
          ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
        }

        const hasBinaryData = containsBinaryData(requestData)

        if (hasBinaryData) {
          const formData = new FormData()
          let binaryIndex = 0
          const processedData = processBinaryData(requestData, (binaryData) => {
            const fieldName = `binary_${binaryIndex++}`
            formData.append(fieldName, binaryData)
            return fieldName
          })
          formData.append('json', JSON.stringify(processedData))
          body = formData
          // Browser will set Content-Type with boundary for FormData
        } else {
          body = JSON.stringify(requestData)
          headers['Content-Type'] = 'application/json'
        }

        const response = await fetchFn(endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)
        
        if (!response.ok) {
          let errorMessage = `HTTP error: ${response.status}`
          try {
            const errorData = await response.text()
            if (errorData) {
              errorMessage += ` - ${errorData}`
            }
          } catch (e) {
            // Ignore error reading response body
          }
          throw new Error(errorMessage)
        }
        
        const contentType = response.headers.get('content-type')
        let responseData: any

        if (contentType && contentType.includes('multipart/form-data')) {
          const formData = await response.formData()
          const jsonData = JSON.parse(formData.get('json') as string || '{}')
          
          if (!jsonData.success) {
            throw new Error(jsonData.error || 'RPC call failed')
          }

          const binaryDataMap: Record<string, any> = {}
          for (const [key, entryValue] of formData.entries()) {
            const value = entryValue as any
            if (key.startsWith('binary_') && value instanceof Blob) {
              const arrayBuffer = await value.arrayBuffer()
              binaryDataMap[key] = {
                data: arrayBuffer,
                type: value.type,
                size: value.size,
              }
            }
          }
          responseData = restoreBinaryData(jsonData.data, binaryDataMap)
        } else {
          const jsonData = await response.json()
          if (!jsonData.success) {
            throw new Error(jsonData.error || 'RPC call failed')
          }
          responseData = jsonData.data
        }
        
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
