# quotez QOTD nanoservice - Multi-stage multi-arch Docker build
#
# Build single-arch:
#   docker build -t quotez:latest .
#
# Build multi-arch:
#   docker buildx build --platform linux/amd64,linux/arm64 -t quotez:latest .
#
# Run:
#   docker run -d -p 8017:8017/tcp -p 8017:8017/udp -p 8080:8080/tcp \
#     -v ./quotes:/data/quotes:ro \
#     quotez:latest

# ==============================================================================
# Stage 1: Builder - Alpine + released Zig 0.17.0
# ==============================================================================
FROM alpine:latest AS builder

# Install dependencies for Zig download and build
RUN apk add --no-cache binutils curl tar xz

ARG ZIG_VERSION=0.17.0
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      amd64) ZIG_ARCH="x86_64" ;; \
      arm64) ZIG_ARCH="aarch64" ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    curl -fsSL "https://ziglang.org/download/${ZIG_VERSION}/zig-${ZIG_ARCH}-linux-${ZIG_VERSION}.tar.xz" -o zig.tar.xz && \
    tar -xf zig.tar.xz && \
    mv zig-${ZIG_ARCH}-linux-${ZIG_VERSION} /opt/zig && \
    rm zig.tar.xz

ENV PATH="/opt/zig:${PATH}"

# Set working directory
WORKDIR /build

# Copy source files
COPY src/ src/
COPY build.zig build.zig

# Build a static binary with Zig's native cross-compilation support.
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      amd64) ZIG_TARGET="x86_64-linux-musl" ;; \
      arm64) ZIG_TARGET="aarch64-linux-musl" ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    zig build \
      -Doptimize=ReleaseSmall \
      -Dtarget=${ZIG_TARGET} && \
    cp zig-out/bin/quotez quotez && \
    strip quotez

# ==============================================================================
# Stage 2: Runtime - Distroless static with nonroot user
# ==============================================================================
FROM gcr.io/distroless/static:nonroot

# OCI labels
LABEL org.opencontainers.image.title="quotez"
LABEL org.opencontainers.image.description="RFC 865 Quote of the Day (QOTD) nanoservice in Zig"
LABEL org.opencontainers.image.version="0.1.0"
LABEL org.opencontainers.image.source="https://github.com/fulgidus/quotez"
LABEL org.opencontainers.image.created="2026-03-03T00:00:00Z"

# Copy binary from builder
COPY --from=builder /build/quotez /quotez

# Copy production configuration
COPY quotez.docker.toml /quotez.toml

# Expose ports
EXPOSE 8017/tcp
EXPOSE 8017/udp

# Run as nonroot (UID 65532) - inherited from distroless/static:nonroot
USER 65532

# Entrypoint with config path argument
ENTRYPOINT ["/quotez", "/quotez.toml"]
