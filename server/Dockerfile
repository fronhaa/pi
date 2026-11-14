# Servidor do modo cooperativo (docs/servidor-coop.md).
# Build a partir da RAIZ do repositório (precisa de public/data/donki-flares.json):
#   docker build -f server/Dockerfile -t jezero-coop .

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/jezero-server ./cmd/jezero-server

# Imagem final mínima: sem shell, sem gerenciador de pacotes, roda como usuário sem privilégio.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/jezero-server /app/jezero-server
COPY public/data/donki-flares.json /app/data/donki-flares.json
ENV PORT=8080 \
    FLARES_PATH=/app/data/donki-flares.json
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["/app/jezero-server", "healthcheck"]
ENTRYPOINT ["/app/jezero-server"]
