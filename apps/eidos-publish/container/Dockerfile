FROM rust:1.91.1-bookworm AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY apps/cli ./apps/cli
COPY skills/eidos /build/skills/eidos
COPY packages/eidos-file/src ./packages/eidos-file/src
COPY packages/eidos-file/package.json ./packages/eidos-file/package.json
COPY packages/eidos-file/generated ./packages/eidos-file/generated
COPY packages/eidos-file-ui ./packages/eidos-file-ui
COPY packages/eidos-file-serve ./packages/eidos-file-serve
COPY packages/markdown ./packages/markdown
COPY packages/plugin-runtime/src ./packages/plugin-runtime/src
COPY packages/plugin-runtime/package.json ./packages/plugin-runtime/package.json
COPY scripts/build-quickjs.mjs scripts/generated-assets.mjs ./scripts/
RUN cargo build -p eidos --release --locked --bin eidos --bin eidos-publish-supervisor

FROM debian:bookworm-slim

COPY --from=builder /build/target/release/eidos /usr/local/bin/eidos
COPY --from=builder /build/target/release/eidos-publish-supervisor /usr/local/bin/eidos-publish-supervisor
RUN chmod 0555 /usr/local/bin/eidos /usr/local/bin/eidos-publish-supervisor \
    && mkdir --mode=0700 /data \
    && chown 65532:65532 /data

USER 65532:65532
WORKDIR /data
ENV EIDOS_SUPERVISOR_PORT=8420 \
    EIDOS_RUNTIME_MAX_ACTIVE=6 \
    EIDOS_RUNTIME_MAX_CACHE_BYTES=3221225472 \
    EIDOS_RUNTIME_MAX_INFLIGHT=32
EXPOSE 8420

ENTRYPOINT ["/usr/local/bin/eidos-publish-supervisor"]
