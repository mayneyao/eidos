FROM nginx:alpine

# Create a custom Nginx configuration file
RUN echo 'server { \
    listen       80; \
    server_name  localhost; \
    root   /usr/share/nginx/html; \
    index  index.html; \
    # Handle all locations
    location / { \
        try_files $uri $uri/ /index.html; \
        # Add security headers
        add_header Cross-Origin-Embedder-Policy "require-corp"; \
        add_header Cross-Origin-Opener-Policy "same-origin"; \
    } \
}' > /etc/nginx/conf.d/default.conf

COPY ./dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]