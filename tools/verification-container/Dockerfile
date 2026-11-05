FROM ubuntu:24.04

ARG TARGETARCH
ARG GO_VERSION
ARG NODE_VERSION
ARG PLAYWRIGHT_VERSION

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl file git libgtk-3-dev \
    libwebkit2gtk-4.1-dev lsof pkg-config python3 xauth xclip \
    xz-utils xvfb && rm -rf /var/lib/apt/lists/*

COPY verify_go.py /usr/local/bin/verify_go.py

RUN set -eu; \
    curl -fsSLo /tmp/go-downloads.json 'https://go.dev/dl/?mode=json&include=all'; \
    checksum="$(python3 /usr/local/bin/verify_go.py /tmp/go-downloads.json "$GO_VERSION" "$TARGETARCH")"; \
    curl -fsSLo /tmp/go.tar.gz "https://go.dev/dl/go${GO_VERSION}.linux-${TARGETARCH}.tar.gz"; \
    printf '%s  %s\n' "$checksum" /tmp/go.tar.gz | sha256sum -c -; \
    tar -C /usr/local -xzf /tmp/go.tar.gz; \
    rm /tmp/go.tar.gz /tmp/go-downloads.json

RUN set -eu; \
    case "$TARGETARCH" in amd64) node_arch=x64 ;; arm64) node_arch=arm64 ;; *) exit 1 ;; esac; \
    node_file="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    curl -fsSLo "/tmp/$node_file" "https://nodejs.org/dist/v${NODE_VERSION}/$node_file"; \
    curl -fsSLo /tmp/SHASUMS256.txt "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    (cd /tmp && grep "  ${node_file}$" SHASUMS256.txt | sha256sum -c -); \
    tar -C /usr/local --strip-components=1 -xJf "/tmp/$node_file"; \
    rm "/tmp/$node_file" /tmp/SHASUMS256.txt

ENV PATH=/usr/local/go/bin:/usr/local/bin:$PATH

RUN npx --yes "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium

WORKDIR /work
