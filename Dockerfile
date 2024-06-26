FROM node:alpine as builder

RUN apk add --no-cache python3 make g++ && ln -sf python3 /usr/bin/python

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install

COPY . .

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