// Servidor do modo cooperativo online da Missão Jezero.
// Guia: docs/servidor-coop.md. Decisão: docs/decisoes/0005-servidor-coop-em-go-com-as-regras.md.
//
// Variáveis de ambiente:
//
//	PORT             porta HTTP (padrão 8080)
//	FLARES_PATH      erupções reais do DONKI (padrão data/donki-flares.json; sem arquivo = simuladas)
//	ALLOWED_ORIGINS  hosts que podem conectar, separados por vírgula (padrão "localhost:*,127.0.0.1:*")
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/fronhaa/pi/server/internal/coop"
	"github.com/fronhaa/pi/server/internal/sim"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	port := env("PORT", "8080")
	// `jezero-server healthcheck`: usado pelo Docker (a imagem mínima não tem curl).
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck(port))
	}
	origins := strings.Split(env("ALLOWED_ORIGINS", "localhost:*,127.0.0.1:*"), ",")
	flares := loadFlares(env("FLARES_PATH", "data/donki-flares.json"), log)

	hub := coop.NewHub(flares)
	mux := http.NewServeMux()
	mux.Handle("/ws", &coop.WSHandler{Hub: hub, OriginPatterns: origins, Log: log})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "rooms": hub.Count(), "realFlares": len(flares)})
	})

	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadHeaderTimeout: 10 * time.Second}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-t.C:
				hub.Sweep(now)
			}
		}
	}()

	go func() {
		log.Info("servidor coop no ar", "port", port, "origins", origins, "realFlares", len(flares))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("falha no servidor", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
	log.Info("servidor encerrado")
}

func healthcheck(port string) int {
	c := http.Client{Timeout: 3 * time.Second}
	res, err := c.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		return 1
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func env(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// loadFlares lê o snapshot do DONKI com a MESMA regra do cliente (src/data/flares.ts): só M e X.
func loadFlares(path string, log *slog.Logger) []sim.Flare {
	raw, err := os.ReadFile(path)
	if err != nil {
		log.Warn("sem erupções reais; usando simuladas", "path", path, "err", err)
		return nil
	}
	var file struct {
		Flares []struct {
			Time string `json:"time"`
			Cls  string `json:"cls"`
			Link string `json:"link"`
		} `json:"flares"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		log.Warn("snapshot do DONKI inválido; usando simuladas", "err", err)
		return nil
	}
	var out []sim.Flare
	for _, f := range file.Flares {
		if f.Cls == "" || (f.Cls[0] != 'M' && f.Cls[0] != 'X') {
			continue
		}
		out = append(out, sim.Flare{Cls: sim.FlareClass(f.Cls[:1]), Label: f.Cls, Real: true, Time: f.Time, Link: f.Link})
	}
	if len(out) < sim.Config.StormCount {
		log.Warn("poucas erupções reais; usando simuladas", "n", len(out))
		return nil
	}
	return out
}
