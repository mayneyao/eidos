FROM rust:1.91.1-bookworm AS builder

WORKDIR /build/apps/cli
COPY apps/cli/Cargo.toml apps/cli/Cargo.lock apps/cli/build.rs ./
COPY apps/cli/core ./core
COPY apps/cli/qjs-host ./qjs-host
COPY apps/cli/src ./src
RUN cargo build --release --locked --bin eidos --bin eidos-publish-supervisor

FROM debian:bookworm-slim

COPY --from=builder /build/apps/cli/target/release/eidos /usr/local/bin/eidos
COPY --from=builder /build/apps/cli/target/release/eidos-publish-supervisor /usr/local/bin/eidos-publish-supervisor
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
