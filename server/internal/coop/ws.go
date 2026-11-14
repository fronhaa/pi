package coop

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"
)

const (
	readLimit        = 4 << 10 // 4 KB por mensagem: as ações são pequenas
	defaultMaxPerSec = 20      // ações por segundo por conexão (criança apertando muito rápido passa folgado)
	writeWait        = 5 * time.Second
	pingEvery        = 25 * time.Second
	sendBuffer       = 32
)

// WSHandler atende /ws. OriginPatterns: hosts de onde o jogo pode conectar (ex.: "fronhaa.github.io").
type WSHandler struct {
	Hub            *Hub
	OriginPatterns []string
	Log            *slog.Logger
	MaxPerSec      int // 0 = padrão (20)
}

type welcomeMsg struct {
	T        string `json:"t"`
	Code     string `json:"code"`
	PlayerID string `json:"playerId"`
	Token    string `json:"token"`
}

type errorMsg struct {
	T    string `json:"t"`
	Code string `json:"code"`
}

var knownErrors = []error{
	errRoomFull, errRoomNotFound, errRoleTaken, errNeedCommander, errBadToken, errTooManyRooms,
	ErrNotYourRole, ErrWrongPhase, ErrInvalidInput, ErrCardPending,
}

func errorCode(err error) string {
	for _, k := range knownErrors {
		if errors.Is(err, k) {
			return k.Error()
		}
	}
	return ErrInvalidInput.Error()
}

func (h *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: h.OriginPatterns})
	if err != nil {
		return // Accept já respondeu (ex.: origem não permitida)
	}
	c.SetReadLimit(readLimit)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	out := make(chan []byte, sendBuffer)
	send := func(b []byte) {
		select {
		case out <- b:
		default: // cliente lento demais: derruba; ele reconecta com o token
			cancel()
		}
	}
	sendJSON := func(v any) {
		if b, err := json.Marshal(v); err == nil {
			send(b)
		}
	}

	// Escritor e ping.
	go func() {
		ping := time.NewTicker(pingEvery)
		defer ping.Stop()
		for {
			select {
			case <-ctx.Done():
				c.CloseNow()
				return
			case b := <-out:
				wctx, wcancel := context.WithTimeout(ctx, writeWait)
				err := c.Write(wctx, websocket.MessageText, b)
				wcancel()
				if err != nil {
					cancel()
				}
			case <-ping.C:
				pctx, pcancel := context.WithTimeout(ctx, writeWait)
				err := c.Ping(pctx)
				pcancel()
				if err != nil {
					cancel()
				}
			}
		}
	}()

	var room *Room
	var me *Player
	defer func() {
		if room != nil && me != nil {
			room.disconnect(me.ID)
		}
	}()

	window := time.Now()
	count := 0
	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			return
		}
		if now := time.Now(); now.Sub(window) >= time.Second {
			window, count = now, 0
		}
		limit := h.MaxPerSec
		if limit == 0 {
			limit = defaultMaxPerSec
		}
		if count++; count > limit {
			sendJSON(errorMsg{T: "error", Code: "too_fast"})
			continue
		}
		var a Action
		if json.Unmarshal(data, &a) != nil {
			sendJSON(errorMsg{T: "error", Code: ErrInvalidInput.Error()})
			continue
		}

		if room == nil {
			room, me, err = h.enter(a, send, sendJSON)
			if err != nil {
				room, me = nil, nil
				sendJSON(errorMsg{T: "error", Code: errorCode(err)})
			}
			continue
		}
		if err := room.Handle(me.ID, a); err != nil {
			sendJSON(errorMsg{T: "error", Code: errorCode(err)})
		}
	}
}

// enter trata as três formas de entrar numa sala: criar, entrar com código e reconectar.
func (h *WSHandler) enter(a Action, send func([]byte), sendJSON func(any)) (*Room, *Player, error) {
	switch a.T {
	case "create":
		room, err := h.Hub.Create()
		if err != nil {
			return nil, nil, err
		}
		p := NewPlayer(send)
		sendJSON(welcomeMsg{T: "welcome", Code: room.Code, PlayerID: p.ID, Token: p.Token})
		if err := room.join(p); err != nil {
			return nil, nil, err
		}
		h.Log.Info("sala criada", "code", room.Code, "rooms", h.Hub.Count())
		return room, p, nil
	case "join":
		room, err := h.Hub.Get(a.Code)
		if err != nil {
			return nil, nil, err
		}
		p := NewPlayer(send)
		sendJSON(welcomeMsg{T: "welcome", Code: room.Code, PlayerID: p.ID, Token: p.Token})
		if err := room.join(p); err != nil {
			return nil, nil, err
		}
		return room, p, nil
	case "rejoin":
		room, err := h.Hub.Get(a.Code)
		if err != nil {
			return nil, nil, err
		}
		sendJSON(welcomeMsg{T: "welcome", Code: room.Code, Token: a.Token})
		p, err := room.rejoin(a.Token, send)
		if err != nil {
			return nil, nil, err
		}
		return room, p, nil
	default:
		return nil, nil, ErrWrongPhase
	}
}
