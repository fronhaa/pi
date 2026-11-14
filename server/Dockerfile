# Servidor do modo cooperativo (docs/servidor-coop.md). Também serve o jogo: um endereço só.
# Build a partir da RAIZ do repositório:
#   docker build -f server/Dockerfile -t jezero-coop .

# 1) O jogo (Vite). VITE_COOP_URL=same-origin: o jogo conecta no /ws do mesmo endereço.
FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts vite.sim.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
RUN VITE_COOP_URL=same-origin npm run build

# 2) O servidor (Go).
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/jezero-server ./cmd/jezero-server

# 3) Imagem final mínima: sem shell, sem gerenciador de pacotes, usuário sem privilégio.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/jezero-server /app/jezero-server
COPY --from=web /web/dist /app/web
COPY public/data/donki-flares.json public/data/missions.json /app/data/
ENV PORT=8080 \
    FLARES_PATH=/app/data/donki-flares.json \
    MISSIONS_PATH=/app/data/missions.json \
    WEB_DIR=/app/web
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["/app/jezero-server", "healthcheck"]
ENTRYPOINT ["/app/jezero-server"]
