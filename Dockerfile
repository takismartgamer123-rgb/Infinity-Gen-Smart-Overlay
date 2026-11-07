# Build native Canvas dependencies in a Node 22 environment.
FROM node:22-bookworm-slim AS build

ENV npm_config_build_from_source=true
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       python3 \
       make \
       g++ \
       pkg-config \
       libcairo2-dev \
       libpango1.0-dev \
       libjpeg-dev \
       libgif-dev \
       librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Runtime image: FFmpeg plus the shared libraries required by node-canvas.
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/infinity-ultra.sqlite \
    TMPDIR=/data/tmp

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       ffmpeg \
       libcairo2 \
       libpango-1.0-0 \
       libpangocairo-1.0-0 \
       libpangoft2-1.0-0 \
       libjpeg62-turbo \
       libgif7 \
       librsvg2-2 \
       fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/tmp

WORKDIR /app
COPY --from=build /app /app

EXPOSE 3000

CMD ["sh", "-c", "mkdir -p /data/tmp \"$(dirname \"$DATABASE_PATH\")\" && exec node ultra/src/index.js"]
