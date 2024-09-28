> [!IMPORTANT]
> This app depends on some Web APIs, which are available only in secure contexts (HTTPS/localhost). Access via IP is not supported.

### Static Hosting

Download the release(looks like `build-v0.x.x.zip`) from the [release page](https://github.com/mayneyao/eidos/releases) and host it on your own server.

Due to security limitations, browsers may refuse to load WASM from pages served via file:// URLs. You may need to serve the files via a web server and need to modify the HTTP response header to ensure it works normally. This depends on the web server you are using; there are some configurations that can be referenced here:

- Nginx config in [Dockerfile](../Dockerfile)
- [vercel.json](../vercel.json)
- [public/\_headers](../public/_headers) for cloudflare pages

### Serverless

Fork this repository and deploy it to your favorite serverless provider. Cloudflare Pages, Vercel, and Netlify are all good choices.

Use `build:self-host` to build the app; this will skip the activation.

### Docker

1. Run `docker build -t eidos .` to build the docker image
2. Run `docker run -p 8080:80 eidos` to start the container, change the port if needed

or use the pre-built image:

```shell
docker run -d  -p 8080:80 ghcr.io/mayneyao/eidos
```
