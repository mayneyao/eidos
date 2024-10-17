/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);
		const platform = url.pathname.split('/').pop()?.toLowerCase();

		if (platform !== 'mac' && platform !== 'win') {
			return new Response('Invalid platform. Use /mac or /win', { status: 400 });
		}

		const baseUrl = 'https://api.github.com/repos'

		const owner = 'mayneyao'
		const repo = 'eidos'

		const apiUrl = `${baseUrl}/${owner}/${repo}/releases`

		try {
			const response = await fetch(apiUrl, {
				headers: {
					'User-Agent': 'Cloudflare Worker GitHub Release Checker',
					'Accept': 'application/vnd.github.v3+json'
				}
			})

			if (!response.ok) {
				throw new Error(`GitHub API responded with ${response.status} ${response.statusText}`)
			}

			const releases = await response.json() as Array<{ assets: Array<any> }>
			const latestRelease = releases[0]
			if (!latestRelease) {
				return new Response('No release found', { status: 404 })
			}

			const asset = latestRelease.assets.find((asset: any) => {
				const name = asset.name.toLowerCase();
				if (platform === 'mac') {
					return name.endsWith('.dmg');
				} else {
					return name.endsWith('.exe');
				}
			});

			if (!asset) {
				return new Response(`No ${platform} release found`, { status: 404 });
			}

			return Response.redirect(asset.browser_download_url, 302);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return new Response(`Error: ${errorMessage}`, { status: 500 })
		}
	},
};
