package coop

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/fronhaa/pi/server/internal/sim"
)

// Action é a mensagem que o cliente manda (JSON). Só os campos da ação usada vêm preenchidos.
type Action struct {
	T        string    `json:"t"`
	Code     string    `json:"code,omitempty"`
	Token    string    `json:"token,omitempty"`
	Role     Role      `json:"role,omitempty"`
	Option   string    `json:"option,omitempty"`
	Key      string    `json:"key,omitempty"`
	Value    int       `json:"value,omitempty"`
	UID      int       `json:"uid,omitempty"`
	Progress float64   `json:"progress,omitempty"`
	List     []CrewPos `json:"list,omitempty"` // crew_pos
	Pair     []Role    `json:"pair,omitempty"` // eva: [líder, parceiro]
}

var (
	errRoomFull      = errors.New("room_full")
	errRoomNotFound  = errors.New("room_not_found")
	errRoleTaken     = errors.New("role_taken")
	errNeedCommander = errors.New("need_commander")
	errBadToken      = errors.New("bad_token")
	errTooManyRooms  = errors.New("server_full")
)

// Sem vogais: o código nunca forma palavra (nem palavrão). Sem letras que confundem (I, O).
const codeAlphabet = "BCDFGHJKLMNPQRSTVWXZ"
const codeLen = 4

// Hub guarda as salas abertas. Tudo em memória: se o servidor reiniciar, as salas somem.
type Hub struct {
	mu        sync.Mutex
	rooms     map[string]*Room
	flares    []sim.Flare
	missions  []sim.HistoricalMission
	MaxRooms  int
	IdleTTL   time.Duration
	TimeScale float64 // relógio do dia das salas novas (1 = tempo real; maior só em teste)
}

func NewHub(flares []sim.Flare, missions []sim.HistoricalMission) *Hub {
	return &Hub{rooms: map[string]*Room{}, flares: flares, missions: missions, MaxRooms: 1000, IdleTTL: 15 * time.Minute, TimeScale: 1}
}

func (h *Hub) Create() (*Room, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.rooms) >= h.MaxRooms {
		return nil, errTooManyRooms
	}
	for {
		code := randomCode()
		if _, taken := h.rooms[code]; !taken {
			r := newRoom(code, h.flares, h.missions, func() (uint32, uint32) { return randomU32(), randomU32() })
			r.TimeScale = h.TimeScale
			h.rooms[code] = r
			return r, nil
		}
	}
}

func (h *Hub) Get(code string) (*Room, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[code]
	if !ok {
		return nil, errRoomNotFound
	}
	return r, nil
}

func (h *Hub) Count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.rooms)
}

// Sweep apaga salas sem ninguém conectado há mais de IdleTTL. Rode periodicamente.
func (h *Hub) Sweep(now time.Time) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for code, r := range h.rooms {
		last, anyone := r.idleSince()
		if !anyone && now.Sub(last) > h.IdleTTL {
			delete(h.rooms, code)
		}
	}
}

func NewPlayer(send func([]byte)) *Player {
	return &Player{ID: randomHex(8), Token: randomHex(16), send: send}
}

func randomCode() string {
	b := make([]byte, codeLen)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = codeAlphabet[int(b[i])%len(codeAlphabet)]
	}
	return string(b)
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func randomU32() uint32 {
	var b [4]byte
	_, _ = rand.Read(b[:])
	return binary.LittleEndian.Uint32(b[:])
}
