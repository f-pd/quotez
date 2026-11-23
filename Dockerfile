# quotez QOTD nanoservice - FROM scratch image
#
# CI builds and publishes this to ghcr.io/f-pd/quotez (see
# .github/workflows/ci.yml); production only pulls it.
#
# Local build:
#   docker build -t quotez:latest .
# Multi-arch:
#   docker buildx build --platform linux/amd64,linux/arm64 -t quotez:latest .

# ==============================================================================
# Stage 1: builder runs natively on the build host and cross-compiles with Zig,
# so multi-arch builds need no QEMU emulation.
# ==============================================================================
FROM --platform=$BUILDPLATFORM alpine:3.22 AS builder

RUN apk add --no-cache curl tar xz

ARG ZIG_VERSION=0.17.0
ARG BUILDARCH
RUN case "${BUILDARCH}" in \
      amd64) ZIG_ARCH="x86_64" ;; \
      arm64) ZIG_ARCH="aarch64" ;; \
      *) echo "Unsupported build architecture: ${BUILDARCH}" && exit 1 ;; \
    esac && \
    curl -fsSL "https://ziglang.org/download/${ZIG_VERSION}/zig-${ZIG_ARCH}-linux-${ZIG_VERSION}.tar.xz" -o zig.tar.xz && \
    tar -xf zig.tar.xz && \
    mv zig-${ZIG_ARCH}-linux-${ZIG_VERSION} /opt/zig && \
    rm zig.tar.xz

ENV PATH="/opt/zig:${PATH}"
WORKDIR /build

COPY build.zig build.zig
COPY src/ src/

# ReleaseSmall output is already stripped; static musl, no runtime deps.
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      amd64) ZIG_TARGET="x86_64-linux-musl" ;; \
      arm64) ZIG_TARGET="aarch64-linux-musl" ;; \
      *) echo "Unsupported target architecture: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    zig build -Doptimize=ReleaseSmall -Dtarget=${ZIG_TARGET} && \
    mkdir -p /rootfs/data/quotes && \
    chown 65532:65532 /rootfs/data/quotes && \
    cp zig-out/bin/quotez /rootfs/quotez

COPY quotez.docker.toml /rootfs/quotez.toml
COPY quotes/ /rootfs/data/seed-quotes/

# ==============================================================================
# Stage 2: runtime - nothing but the binary, its config and the quote dirs.
# ==============================================================================
FROM scratch

LABEL org.opencontainers.image.title="quotez"
LABEL org.opencontainers.image.description="RFC 865 Quote of the Day (QOTD) nanoservice in Zig"
LABEL org.opencontainers.image.source="https://github.com/f-pd/quotez"

# Ownership is preserved: /data/quotes belongs to the runtime user, so a fresh
# named volume mounted there inherits it (no init container needed).
COPY --from=builder /rootfs/ /

EXPOSE 8017/tcp
EXPOSE 8017/udp
EXPOSE 8080/tcp

USER 65532:65532
ENTRYPOINT ["/quotez", "/quotez.toml"]
