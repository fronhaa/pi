package coop

import (
	"encoding/json"
	"slices"
	"sync"
	"time"

	"github.com/fronhaa/pi/server/internal/sim"
)

const MaxPlayers = 5

// Player NÃO guarda nome nem nenhum dado pessoal: são crianças (LGPD).
// Na tela aparece "Jogador 1..5" pela ordem de entrada.
type Player struct {
	ID        string
	Token     string // para reconectar se a internet cair
	Number    int
	Connected bool
	send      func([]byte) // entrega uma mensagem a este jogador (nil = desconectado)
}

// Room é uma sala. Todos os métodos públicos travam o mutex e avisam os jogadores no fim.
type Room struct {
	mu         sync.Mutex
	Code       string
	hostID     string
	players    []*Player
	owners     map[Role]string // papel -> ID do jogador
	game       *Game
	flares     []sim.Flare
	missions   []sim.HistoricalMission
	firstGame  bool   // primeira partida da sala: só missão histórica de força média (como no solo)
	level      string // nível da próxima partida (o dono da sala escolhe no saguão); padrão sim.DefaultLevel
	seeds      func() (uint32, uint32)
	lastActive time.Time
	nextNumber int

	// Última posição de cada astronauta (modo em grupo; só visual). Vai no "state" para quem reconecta.
	crew map[Role]CrewPos
	// Dupla em EVA (no máximo uma por sala) e quem a comanda. Ver eva.go.
	eva *EvaView

	// Relógio do dia: TimeScale > 1 acelera (só nos testes). dayGen evita dois relógios ao mesmo tempo.
	TimeScale float64
	dayGen    int
}

func newRoom(code string, flares []sim.Flare, missions []sim.HistoricalMission, seeds func() (uint32, uint32)) *Room {
	return &Room{
		Code: code, owners: map[Role]string{}, flares: flares, missions: missions, firstGame: true, level: sim.DefaultLevel,
		seeds: seeds, lastActive: time.Now(), nextNumber: 1, TimeScale: 1,
	}
}

// ---------- entrada e saída ----------

func (r *Room) join(p *Player) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.players) >= MaxPlayers {
		return errRoomFull
	}
	p.Number = r.nextNumber
	r.nextNumber++
	p.Connected = true
	r.players = append(r.players, p)
	if r.hostID == "" {
		r.hostID = p.ID
	}
	r.touch()
	r.broadcastLocked()
	return nil
}

func (r *Room) rejoin(token string, send func([]byte)) (*Player, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, p := range r.players {
		if p.Token == token {
			p.Connected = true
			p.send = send
			r.touch()
			r.broadcastLocked()
			return p, nil
		}
	}
	return nil, errBadToken
}

func (r *Room) disconnect(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if p := r.player(id); p != nil {
		p.Connected = false
		p.send = nil
	}
	r.broadcastLocked()
}

func (r *Room) idleSince() (time.Time, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	anyone := slices.ContainsFunc(r.players, func(p *Player) bool { return p.Connected })
	return r.lastActive, anyone
}

// ---------- ações ----------

// Handle aplica uma ação de um jogador. Erros vão só para quem pediu.
func (r *Room) Handle(playerID string, a Action) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.touch()
	if a.T == "crew_pos" { // só visual: repassa sem mandar o estado inteiro
		return r.crewLocked(playerID, a.List)
	}
	err := r.apply(playerID, a)
	if err == nil {
		r.broadcastLocked()
	}
	return err
}

func (r *Room) apply(pid string, a Action) error {
	switch a.T {
	case "claim":
		if r.game != nil {
			return ErrWrongPhase
		}
		if !slices.Contains(AllRoles, a.Role) {
			return ErrInvalidInput
		}
		if owner, ok := r.owners[a.Role]; ok && owner != pid {
			return errRoleTaken
		}
		r.owners[a.Role] = pid
	case "release":
		if r.game != nil {
			return ErrWrongPhase
		}
		if r.owners[a.Role] == pid {
			delete(r.owners, a.Role)
		}
	case "level":
		// Só o dono da sala escolhe o nível, antes da partida (ou depois do fim, para a próxima).
		if pid != r.hostID {
			return ErrNotYourRole
		}
		if r.game != nil && r.game.Phase != PhaseEnded {
			return ErrWrongPhase
		}
		if !sim.IsLevel(a.Level) {
			return ErrInvalidInput
		}
		r.level = a.Level
	case "start":
		if pid != r.hostID {
			return ErrNotYourRole
		}
		if r.game != nil && r.game.Phase != PhaseEnded {
			return ErrWrongPhase
		}
		return r.start()
	case "earth":
		if err := r.must(pid, Earth); err != nil {
			return err
		}
		return r.game.SendEarth(a.Option)
	case "card":
		if err := r.must(pid, Commander); err != nil {
			return err
		}
		return r.game.AnswerCard(a.Option)
	case "blocks":
		role, ok := BlockRole[a.Key]
		if !ok {
			return ErrInvalidInput
		}
		if err := r.must(pid, role); err != nil {
			return err
		}
		return r.game.SetBlocks(a.Key, a.Value)
	case "start_day", "end_sol": // "Começar o dia" (ou "Terminar o sol" quando não há problemas)
		if err := r.must(pid, Commander); err != nil {
			return err
		}
		if err := r.game.StartDay(); err != nil {
			return err
		}
		if r.game.Phase == PhaseDay {
			r.startClock()
		}
	case "pause":
		if err := r.must(pid, Commander); err != nil {
			return err
		}
		return r.game.TogglePause()
	case "end_day":
		if err := r.must(pid, Commander); err != nil {
			return err
		}
		return r.game.EndDay()
	case "eva":
		return r.startEva(pid, a.Pair)
	case "eva_end":
		return r.endEva(pid)
	case "problem_progress", "problem_resolve":
		if err := r.mustMars(pid); err != nil {
			return err
		}
		if a.T == "problem_resolve" {
			// Com a EVA proibida (tempestade avisada), problema de fora não pode ser consertado.
			if r.game.Phase == PhaseDay && !r.game.Mission.CanResolve(a.UID) {
				return errEvaBanned
			}
			return r.game.ResolveProblem(a.UID)
		}
		return r.game.ProblemProgress(a.UID, a.Progress)
	default:
		return ErrInvalidInput
	}
	return nil
}

// start: precisa de comandante. Papéis de Marte sem dono vão para o comandante;
// Terra sem dono = Terra automática (avisos como no jogo solo).
func (r *Room) start() error {
	cmd, ok := r.owners[Commander]
	if !ok {
		return errNeedCommander
	}
	for _, role := range MarsRoles {
		if _, ok := r.owners[role]; !ok {
			r.owners[role] = cmd
		}
	}
	_, hasEarth := r.owners[Earth]
	seed, coopSeed := r.seeds()
	// Missão histórica real, se houver; senão, erupções reais sorteadas; senão, simuladas (igual ao solo).
	hist := sim.PickHistorical(r.missions, seed, r.firstGame, r.level)
	r.firstGame = false
	r.crew = nil
	r.eva = nil
	r.game = NewGame(seed, coopSeed, r.flares, hist, !hasEarth, r.level)
	return nil
}

// startClock roda o relógio do dia enquanto a fase for "day".
func (r *Room) startClock() {
	r.dayGen++
	gen := r.dayGen
	go func() {
		const step = 250 * time.Millisecond
		t := time.NewTicker(step)
		defer t.Stop()
		for range t.C {
			r.mu.Lock()
			if r.game == nil || r.game.Phase != PhaseDay || r.dayGen != gen {
				r.mu.Unlock()
				return
			}
			if r.game.Tick(step.Seconds() * r.TimeScale) {
				r.broadcastLocked()
			}
			r.mu.Unlock()
		}
	}()
}

// mustMars: qualquer papel de Marte (os astronautas são da tripulação toda).
func (r *Room) mustMars(pid string) error {
	if r.game == nil {
		return ErrWrongPhase
	}
	for _, role := range MarsRoles {
		if r.owners[role] == pid {
			return nil
		}
	}
	return ErrNotYourRole
}

func (r *Room) must(pid string, role Role) error {
	if r.game == nil {
		return ErrWrongPhase
	}
	if r.owners[role] != pid {
		return ErrNotYourRole
	}
	return nil
}

func (r *Room) player(id string) *Player {
	for _, p := range r.players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func (r *Room) rolesOf(id string) []Role {
	out := []Role{}
	for _, role := range AllRoles {
		if r.owners[role] == id {
			out = append(out, role)
		}
	}
	return out
}

func (r *Room) touch() { r.lastActive = time.Now() }

// ---------- o que cada jogador vê ----------

type PlayerView struct {
	ID        string `json:"id"`
	Number    int    `json:"number"`
	Roles     []Role `json:"roles"`
	Connected bool   `json:"connected"`
	Host      bool   `json:"host"`
}

type DayView struct {
	Remaining int  `json:"remaining"` // segundos
	Paused    bool `json:"paused"`
}

type HistoricalView struct {
	ID         int    `json:"id"`
	Difficulty string `json:"difficulty"`
	StartUtc   string `json:"startUtc"`
}

type MarsView struct {
	Sol         int                  `json:"sol"`
	Res         sim.Resources        `json:"res"`
	Blocks      int                  `json:"blocks"`
	Plan        sim.EnergyPlan       `json:"plan"`
	PendingCard *sim.Card            `json:"pendingCard"`
	Messages    []MarsMessage        `json:"messages"`
	Outcome     sim.Outcome          `json:"outcome"`
	LastReport  *sim.SolReport       `json:"lastReport"`
	ReportCard  sim.CardID           `json:"reportCard,omitempty"` // carta do sol do relatório (para a lição)
	Storms      []sim.ScheduledStorm `json:"storms,omitempty"`     // só no fim: revela a agenda
	Problems    []sim.Problem        `json:"problems"`             // problemas do dia (os "pending" ainda não apareceram)
	Day         *DayView             `json:"day,omitempty"`        // só na fase "day"
	CommsDown   bool                 `json:"commsDown"`
	Historical  *HistoricalView      `json:"historical,omitempty"`
	Difficulty  string               `json:"difficulty"` // nível desta partida
	// Prévia do plano atual (mesma conta do fim do sol). Com jogador na Terra, sem a tempestade
	// de amanhã: avisar é papel da Terra.
	Preview json.RawMessage `json:"preview,omitempty"`
}

type EarthView struct {
	Sol        int            `json:"sol"`
	Res        sim.Resources  `json:"res"`
	Forecast   []ForecastItem `json:"forecast"`
	Sent       *EarthMessage  `json:"sent"` // o que a Terra mandou neste sol (chega amanhã)
	LastReport *sim.SolReport `json:"lastReport"`
	Outcome    sim.Outcome    `json:"outcome"`
}

type StateMsg struct {
	T         string       `json:"t"` // "state"
	Code      string       `json:"code"`
	Phase     Phase        `json:"phase"`
	You       PlayerView   `json:"you"`
	Players   []PlayerView `json:"players"`
	AutoEarth bool         `json:"autoEarth"`
	// Nível escolhido pelo dono da sala para a próxima partida (no saguão e no fim).
	Level string     `json:"level"`
	Mars  *MarsView  `json:"mars,omitempty"`
	Earth *EarthView `json:"earth,omitempty"`
	// Última posição conhecida de cada astronauta (para quem acabou de entrar ou reconectou).
	Crew []CrewPos `json:"crew,omitempty"`
	// Dupla em EVA e quem a comanda (só durante o dia).
	Eva *EvaView `json:"eva,omitempty"`
}

func (r *Room) broadcastLocked() {
	// A EVA só existe de dia: acabou o dia (noite, fim), a dupla está dentro.
	if r.eva != nil && (r.game == nil || r.game.Phase != PhaseDay) {
		r.eva = nil
	}
	for _, p := range r.players {
		if p.send == nil {
			continue
		}
		if b, err := json.Marshal(r.viewFor(p.ID)); err == nil {
			p.send(b)
		}
	}
}

func (r *Room) viewFor(id string) StateMsg {
	players := make([]PlayerView, 0, len(r.players))
	var you PlayerView
	for _, p := range r.players {
		v := PlayerView{ID: p.ID, Number: p.Number, Roles: r.rolesOf(p.ID), Connected: p.Connected, Host: p.ID == r.hostID}
		players = append(players, v)
		if p.ID == id {
			you = v
		}
	}
	msg := StateMsg{T: "state", Code: r.Code, Phase: PhaseLobby, You: you, Players: players, Level: r.level}
	g := r.game
	if g == nil {
		return msg
	}
	msg.Phase = g.Phase
	msg.AutoEarth = g.AutoEarth
	msg.Eva = r.eva
	for _, role := range MarsRoles {
		if p, ok := r.crew[role]; ok {
			msg.Crew = append(msg.Crew, p)
		}
	}
	s := g.Mission.State
	var last *sim.SolReport
	if n := len(s.Reports); n > 0 {
		last = &s.Reports[n-1]
	}
	isMars := slices.ContainsFunc(you.Roles, func(r Role) bool { return r != Earth })
	isEarth := slices.Contains(you.Roles, Earth)
	ended := g.Phase == PhaseEnded

	if isMars || ended || len(you.Roles) == 0 {
		mv := &MarsView{
			Sol: s.Sol, Res: s.Res, Blocks: s.Blocks, Plan: g.Plan, PendingCard: s.PendingCard,
			Messages: g.MarsMessages(), Outcome: s.Outcome, LastReport: last, Difficulty: s.Difficulty,
		}
		if last != nil {
			mv.ReportCard = s.CardSols[last.Sol]
		}
		if ended {
			mv.Storms = s.Storms
		}
		mv.Problems = s.Problems
		if mv.Problems == nil {
			mv.Problems = []sim.Problem{}
		}
		mv.CommsDown = s.CommsDown
		if g.Phase == PhaseDay {
			mv.Day = &DayView{Remaining: max(0, int(g.DaySeconds()-g.DayElapsed+0.999)), Paused: g.Paused}
		}
		if h := s.Historical; h != nil {
			mv.Historical = &HistoricalView{ID: h.ID, Difficulty: h.Difficulty, StartUtc: h.StartUtc}
		}
		if g.Phase == PhaseMars {
			mv.Preview = g.preview()
		}
		msg.Mars = mv
	}
	if isEarth {
		msg.Earth = &EarthView{Sol: s.Sol, Res: s.Res, Forecast: g.Forecast(), Sent: g.Outbox, LastReport: last, Outcome: s.Outcome}
	}
	return msg
}
