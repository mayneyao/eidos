FROM node:20-slim as builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable


RUN apt-get update && apt-get install -y python3 make g++ && ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY . .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

RUN pnpm run build:self-host

FROM nginx:alpine

RUN echo 'server { \
    listen       80; \
    server_name  localhost; \
    root   /usr/share/nginx/html; \
    index  index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
        add_header Cross-Origin-Embedder-Policy "require-corp"; \
        add_header Cross-Origin-Opener-Policy "same-origin"; \
    } \
}' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]