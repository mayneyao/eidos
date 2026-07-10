export const API_SERVER_HOST = "127.0.0.1"

export function createApiServerListenOptions(
  port: number,
  fetch: (request: Request) => Response | Promise<Response>
) {
  return {
    port,
    hostname: API_SERVER_HOST,
    fetch,
  }
}
