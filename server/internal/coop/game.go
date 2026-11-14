// Package coop tem as regras do modo cooperativo (docs/game-design.md, "Modo cooperativo")
// e as salas. Este arquivo é a LÓGICA PURA de uma partida: sem rede, sem goroutines,
// testável sozinho. Quem chama (Room) cuida de travas e de avisar os jogadores.
package coop

import (
	"encoding/json"
	"errors"
	"slices"

	"github.com/fronhaa/pi/server/internal/sim"
)

type Role string

const (
	Earth     Role = "earth"     // Controle da Missão: vê o clima espacial antes, manda 1 mensagem por sol
	Commander Role = "commander" // cartas e "Terminar o sol"
	Engineer  Role = "engineer"  // blocos de blindagem
	Medic     Role = "medic"     // blocos de suporte de vida
	Scientist Role = "scientist" // blocos de ciência
)

var AllRoles = []Role{Earth, Commander, Engineer, Medic, Scientist}
var MarsRoles = []Role{Commander, Engineer, Medic, Scientist}

// BlockRole: qual papel mexe em qual parte do plano de energia.
var BlockRole = map[string]Role{"shield": Engineer, "life": Medic, "science": Scientist}

// EarthOptions: a lista curta do GDD (uma mensagem por sol).
var EarthOptions = []string{"storm", "dust", "science", "life", "none"}

type Phase string

const (
	PhaseLobby Phase = "lobby"
	PhaseEarth Phase = "earth" // vez da Terra
	PhaseMars  Phase = "mars"  // vez de Marte: carta e plano de energia
	PhaseDay   Phase = "day"   // dia em tempo real: problemas pela base (relógio no servidor)
	PhaseEnded Phase = "ended"
)

var (
	ErrNotYourRole  = errors.New("not_your_role")
	ErrWrongPhase   = errors.New("wrong_phase")
	ErrInvalidInput = errors.New("invalid")
	ErrCardPending  = errors.New("card_pending")
)

// EarthMessage é a mensagem que a Terra mandou; chega a Marte no sol seguinte.
type EarthMessage struct {
	Option   string     `json:"option"`
	DelayMin int        `json:"delayMin"`
	SentSol  int        `json:"sentSol"`
	Flare    *sim.Flare `json:"flare,omitempty"` // se for aviso de tempestade e houver uma prevista
}

// Game é uma partida cooperativa. As regras do sol vêm de sim.Mission (idênticas ao jogo solo).
type Game struct {
	Mission   *sim.Mission
	Plan      sim.EnergyPlan
	Phase     Phase
	AutoEarth bool // sem jogador na Terra: Marte recebe os avisos automáticos, como no solo
	Outbox    *EarthMessage
	Inbox     []EarthMessage
	coopRng   *sim.Rng

	// Dia em tempo real.
	DayElapsed float64
	Paused     bool
}

// NewGame começa uma partida. coopSeed alimenta só os sorteios do modo coop (atraso das
// mensagens da Terra), para não mexer nos sorteios da missão (que seguem o jogo solo).
func NewGame(seed, coopSeed uint32, flares []sim.Flare, historical *sim.HistoricalMission, autoEarth bool) *Game {
	g := &Game{
		Mission:   sim.NewMission(seed, flares, historical),
		Plan:      sim.EnergyPlan{Life: 3, Shield: 1, Science: 3},
		AutoEarth: autoEarth,
		coopRng:   sim.NewRng(coopSeed),
	}
	g.beginSol()
	return g
}

func (g *Game) beginSol() {
	g.clampPlan()
	if g.AutoEarth {
		g.Phase = PhaseMars
	} else {
		g.Phase = PhaseEarth
	}
}

// clampPlan ajusta o plano aos blocos de hoje: corta ciência, depois blindagem, depois vida.
func (g *Game) clampPlan() {
	over := g.Plan.Life + g.Plan.Shield + g.Plan.Science - g.Mission.State.Blocks
	for _, p := range []*int{&g.Plan.Science, &g.Plan.Shield, &g.Plan.Life} {
		if over <= 0 {
			break
		}
		cut := min(*p, over)
		*p -= cut
		over -= cut
	}
}

// SendEarth: vez da Terra. option "none" = "Sem novidades" (também conta como a jogada do sol).
func (g *Game) SendEarth(option string) error {
	if g.Phase != PhaseEarth {
		return ErrWrongPhase
	}
	if !slices.Contains(EarthOptions, option) {
		return ErrInvalidInput
	}
	msg := &EarthMessage{
		Option:   option,
		DelayMin: g.coopRng.Int(sim.Config.CommDelayMin, sim.Config.CommDelayMax),
		SentSol:  g.Mission.State.Sol,
	}
	if option == "storm" {
		if next := g.nextStorm(); next != nil {
			f := next.Flare
			msg.Flare = &f
		}
	}
	g.Outbox = msg
	g.Phase = PhaseMars
	return nil
}

func (g *Game) AnswerCard(option string) error {
	if g.Phase != PhaseMars {
		return ErrWrongPhase
	}
	if _, err := g.Mission.AnswerCard(option); err != nil {
		return ErrInvalidInput
	}
	g.clampPlan() // a carta pode mudar os blocos de hoje (ex.: painéis empoeirados)
	if g.Mission.State.Outcome.Status != "playing" {
		g.Phase = PhaseEnded
	}
	return nil
}

// SetBlocks: cada papel só mexe na sua parte; o total nunca passa dos blocos do sol.
func (g *Game) SetBlocks(key string, value int) error {
	if g.Phase != PhaseMars {
		return ErrWrongPhase
	}
	if g.Mission.State.PendingCard != nil {
		return ErrCardPending
	}
	next := g.Plan
	switch key {
	case "life":
		next.Life = value
	case "shield":
		next.Shield = value
	case "science":
		next.Science = value
	default:
		return ErrInvalidInput
	}
	if !g.Mission.IsPlanValid(next) {
		return ErrInvalidInput
	}
	g.Plan = next
	return nil
}

// StartDay: o comandante trava o plano ("Começar o dia"). Sem problemas hoje, vai direto
// para a noite, como no jogo solo.
func (g *Game) StartDay() error {
	if g.Phase != PhaseMars {
		return ErrWrongPhase
	}
	if g.Mission.State.PendingCard != nil {
		return ErrCardPending
	}
	if !g.Mission.IsPlanValid(g.Plan) {
		return ErrInvalidInput
	}
	if len(g.Mission.State.Problems) == 0 {
		_, err := g.EndSol()
		return err
	}
	g.Phase, g.DayElapsed, g.Paused = PhaseDay, 0, false
	return nil
}

// Tick avança o relógio do dia (chamado pela sala). Abre os problemas na hora e termina o
// dia aos ProblemsDaySeconds ou quando tudo foi consertado. Devolve se algo mudou.
func (g *Game) Tick(dt float64) bool {
	if g.Phase != PhaseDay || g.Paused {
		return false
	}
	before := int(g.DayElapsed)
	g.DayElapsed += dt
	changed := int(g.DayElapsed) != before // o relógio na tela muda a cada segundo
	allDone := true
	for _, p := range g.Mission.State.Problems {
		if p.Status == "pending" && g.DayElapsed >= float64(p.SpawnAt) {
			_ = g.Mission.OpenProblem(p.UID)
			changed = true
		}
		if p.Status != "done" {
			allDone = false
		}
	}
	if g.DayElapsed >= sim.Config.ProblemsDaySeconds || allDone {
		_ = g.endDay()
		return true
	}
	return changed
}

func (g *Game) TogglePause() error {
	if g.Phase != PhaseDay {
		return ErrWrongPhase
	}
	g.Paused = !g.Paused
	return nil
}

// EndDay: o comandante encerra o dia antes do relógio.
func (g *Game) EndDay() error {
	if g.Phase != PhaseDay {
		return ErrWrongPhase
	}
	return g.endDay()
}

func (g *Game) endDay() error {
	if g.Mission.State.Outcome.Status != "playing" {
		g.Phase = PhaseEnded
		return nil
	}
	g.Phase = PhaseMars // EndSol exige a fase de Marte
	_, err := g.EndSol()
	return err
}

// ProblemProgress e ResolveProblem: o que o astronauta de um jogador fez na cena.
func (g *Game) ProblemProgress(uid int, progress float64) error {
	if g.Phase != PhaseDay {
		return ErrWrongPhase
	}
	if err := g.Mission.SetProblemProgress(uid, progress); err != nil {
		return ErrInvalidInput
	}
	return nil
}

func (g *Game) ResolveProblem(uid int) error {
	if g.Phase != PhaseDay {
		return ErrWrongPhase
	}
	if !slices.ContainsFunc(g.Mission.State.Problems, func(p sim.Problem) bool { return p.UID == uid && p.Status == "open" }) {
		return nil // já consertado por outro jogador, ou ainda não apareceu: ignora
	}
	if err := g.Mission.ResolveProblem(uid); err != nil {
		return ErrInvalidInput
	}
	if g.Mission.State.Outcome.Status != "playing" {
		g.Phase = PhaseEnded
	}
	return nil
}

// EndSol executa a noite com o plano. Devolve o relatório.
func (g *Game) EndSol() (sim.SolReport, error) {
	if g.Phase != PhaseMars {
		return sim.SolReport{}, ErrWrongPhase
	}
	if g.Mission.State.PendingCard != nil {
		return sim.SolReport{}, ErrCardPending
	}
	report, err := g.Mission.EndSol(g.Plan)
	if err != nil {
		return sim.SolReport{}, ErrInvalidInput
	}
	if g.Mission.State.Outcome.Status != "playing" {
		g.Phase = PhaseEnded
		return report, nil
	}
	// A mensagem da Terra de ontem chega hoje, a não ser que a antena esteja desalinhada.
	g.Inbox = nil
	if g.Outbox != nil && !g.Mission.State.CommsDown {
		g.Inbox = append(g.Inbox, *g.Outbox)
	}
	g.Outbox = nil
	g.beginSol()
	return report, nil
}

// ForecastDays: quantos sóis à frente a Terra enxerga o clima espacial.
// Precisa ser 2: a mensagem enviada hoje chega amanhã, ainda um sol antes do impacto.
const ForecastDays = 2

type ForecastItem struct {
	Sol   int        `json:"sol"`
	Kind  string     `json:"kind"` // storm | dust
	Flare *sim.Flare `json:"flare,omitempty"`
}

// Forecast: o que a Terra vê (sóis de hoje até hoje+ForecastDays).
func (g *Game) Forecast() []ForecastItem {
	s := g.Mission.State
	out := []ForecastItem{}
	for d := 0; d <= ForecastDays; d++ {
		sol := s.Sol + d
		for _, st := range s.Storms {
			if st.Sol == sol {
				f := st.Flare
				out = append(out, ForecastItem{Sol: sol, Kind: "storm", Flare: &f})
			}
		}
		if s.DustStormSol == sol {
			out = append(out, ForecastItem{Sol: sol, Kind: "dust"})
		}
	}
	return out
}

func (g *Game) nextStorm() *sim.ScheduledStorm {
	s := g.Mission.State
	for i, st := range s.Storms {
		if st.Sol > s.Sol && st.Sol <= s.Sol+ForecastDays {
			return &s.Storms[i]
		}
	}
	return nil
}

// preview: prévia do plano atual. Com jogador na Terra, esconde a tempestade de amanhã.
func (g *Game) preview() json.RawMessage {
	raw, err := g.Mission.PreviewSol(g.Plan)
	if err != nil || string(raw) == "null" {
		return nil
	}
	if g.AutoEarth {
		return raw
	}
	var p map[string]any
	if json.Unmarshal(raw, &p) != nil {
		return nil
	}
	p["stormTomorrow"], p["doseTomorrowIfNow"] = nil, 0
	out, _ := json.Marshal(p)
	return out
}

// MarsMessage é o que aparece em "Mensagens da Terra" para Marte.
// Kind segue sim.Message; o modo coop acrescenta kind "earth" (mensagem de um jogador).
type MarsMessage struct {
	sim.Message
	Option string `json:"option,omitempty"`
}

// MarsMessages: sem jogador na Terra, iguais ao solo. Com jogador na Terra, Marte vê
// o que a Terra mandou ontem + os alarmes da própria base no dia (tempestade e poeira chegando).
func (g *Game) MarsMessages() []MarsMessage {
	out := []MarsMessage{}
	for _, m := range g.Mission.State.Messages {
		if g.AutoEarth || m.Kind == "stormToday" || m.Kind == "dustNow" || m.Kind == "noSignal" {
			out = append(out, MarsMessage{Message: m})
		}
	}
	if !g.AutoEarth {
		for _, e := range g.Inbox {
			out = append(out, MarsMessage{Message: sim.Message{Kind: "earth", DelayMin: float64(e.DelayMin), Flare: e.Flare}, Option: e.Option})
		}
	}
	return out
}
