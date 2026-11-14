package coop

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"io"
	"log/slog"

	"github.com/coder/websocket"
	"github.com/fronhaa/pi/server/internal/sim"
)

// ---------- regras (sem rede) ----------

func TestEarthMessageArrivesNextSol(t *testing.T) {
	g := NewGame(1, 2, nil, nil, false)
	if g.Phase != PhaseEarth {
		t.Fatalf("com jogador na Terra, o sol começa na vez da Terra; fase = %s", g.Phase)
	}
	if err := g.SetBlocks("life", 3); !errors.Is(err, ErrWrongPhase) {
		t.Fatalf("Marte não joga na vez da Terra: %v", err)
	}
	if err := g.SendEarth("science"); err != nil {
		t.Fatal(err)
	}
	if err := g.SendEarth("life"); !errors.Is(err, ErrWrongPhase) {
		t.Fatal("a Terra só manda 1 mensagem por sol")
	}
	for _, m := range g.MarsMessages() {
		if m.Kind == "earth" {
			t.Fatal("a mensagem não pode chegar no mesmo sol")
		}
	}
	answerAnyCard(t, g)
	if _, err := g.EndSol(); err != nil {
		t.Fatal(err)
	}
	var got *MarsMessage
	for _, m := range g.MarsMessages() {
		if m.Kind == "earth" {
			got = &m
		}
	}
	if got == nil || got.Option != "science" || got.DelayMin < 3 || got.DelayMin > 22 {
		t.Fatalf("a mensagem de ontem deveria chegar hoje com atraso de 3 a 22 min: %+v", got)
	}
}

func TestMarsOnlyGetsAutomaticAlertsWithoutEarthPlayer(t *testing.T) {
	auto := NewGame(7, 7, nil, nil, true)
	withEarth := NewGame(7, 7, nil, nil, false)
	for auto.Mission.State.Outcome.Status == "playing" && withEarth.Mission.State.Outcome.Status == "playing" {
		for _, m := range withEarth.MarsMessages() {
			if m.Kind == "stormAlert" || m.Kind == "dustAlert" || m.Kind == "allClear" {
				t.Fatalf("com jogador na Terra, aviso antecipado só vem da Terra; veio %s", m.Kind)
			}
		}
		if len(auto.MarsMessages()) == 0 {
			t.Fatal("sem Terra, Marte recebe os avisos automáticos")
		}
		_ = withEarth.SendEarth("none")
		answerAnyCard(t, auto)
		answerAnyCard(t, withEarth)
		safePlan(auto)
		safePlan(withEarth)
		if _, err := auto.EndSol(); err != nil {
			t.Fatal(err)
		}
		if _, err := withEarth.EndSol(); err != nil {
			t.Fatal(err)
		}
	}
}

func TestEarthForecastSeesStormsBeforeMars(t *testing.T) {
	g := NewGame(3, 3, nil, nil, false)
	seen := false
	for g.Mission.State.Outcome.Status == "playing" {
		for _, f := range g.Forecast() {
			if f.Kind == "storm" && f.Sol == g.Mission.State.Sol+ForecastDays {
				seen = true
			}
		}
		_ = g.SendEarth("storm")
		answerAnyCard(t, g)
		safePlan(g)
		if _, err := g.EndSol(); err != nil {
			t.Fatal(err)
		}
	}
	if !seen {
		t.Fatal("a Terra deveria ver as tempestades 2 sóis antes")
	}
}

// Regressão: carta que reduz os blocos (painéis empoeirados) não pode travar o "Terminar o sol".
func TestCardThatCutsBlocksKeepsPlanValid(t *testing.T) {
	for seed := uint32(1); seed <= 300; seed++ {
		g := NewGame(seed, seed, nil, nil, true)
		for g.Mission.State.Outcome.Status == "playing" {
			answerAnyCard(t, g)
			if g.Phase == PhaseEnded {
				break
			}
			if !g.Mission.IsPlanValid(g.Plan) {
				t.Fatalf("seed %d sol %d: plano %+v passa dos %d blocos", seed, g.Mission.State.Sol, g.Plan, g.Mission.State.Blocks)
			}
			if _, err := g.EndSol(); err != nil {
				t.Fatalf("seed %d sol %d: %v", seed, g.Mission.State.Sol, err)
			}
		}
	}
}

func TestPlanNeverExceedsBlocks(t *testing.T) {
	g := NewGame(11, 11, nil, nil, true)
	answerAnyCard(t, g)
	b := g.Mission.State.Blocks
	if err := g.SetBlocks("science", b+1); !errors.Is(err, ErrInvalidInput) {
		t.Fatal("plano acima dos blocos deveria ser recusado")
	}
	if err := g.SetBlocks("life", -1); !errors.Is(err, ErrInvalidInput) {
		t.Fatal("bloco negativo deveria ser recusado")
	}
}

// ---------- sala e papéis ----------

func TestRolesAndPermissions(t *testing.T) {
	r := newRoom("TEST", nil, nil, func() (uint32, uint32) { return 5, 5 })
	host, kid := NewPlayer(nil), NewPlayer(nil)
	must(t, r.join(host))
	must(t, r.join(kid))
	must(t, r.Handle(host.ID, Action{T: "claim", Role: Commander}))
	must(t, r.Handle(kid.ID, Action{T: "claim", Role: Earth}))
	if err := r.Handle(kid.ID, Action{T: "claim", Role: Commander}); !errors.Is(err, errRoleTaken) {
		t.Fatalf("papel já tomado: %v", err)
	}
	if err := r.Handle(kid.ID, Action{T: "start"}); !errors.Is(err, ErrNotYourRole) {
		t.Fatal("só o anfitrião começa a partida")
	}
	must(t, r.Handle(host.ID, Action{T: "start"}))

	// Papéis de Marte sem dono foram para o comandante.
	for _, role := range MarsRoles {
		if r.owners[role] != host.ID {
			t.Fatalf("%s deveria ser do comandante", role)
		}
	}
	// A Terra não mexe na energia; Marte não manda mensagem da Terra.
	if err := r.Handle(host.ID, Action{T: "earth", Option: "none"}); !errors.Is(err, ErrNotYourRole) {
		t.Fatal("Marte não pode falar pela Terra")
	}
	must(t, r.Handle(kid.ID, Action{T: "earth", Option: "storm"}))
	if err := r.Handle(kid.ID, Action{T: "blocks", Key: "life", Value: 3}); !errors.Is(err, ErrNotYourRole) {
		t.Fatal("a Terra não mexe na energia")
	}

	// O que cada um vê: Terra tem previsão e não tem plano; Marte tem plano e não tem previsão.
	earth, mars := r.viewFor(kid.ID), r.viewFor(host.ID)
	if earth.Earth == nil || earth.Mars != nil {
		t.Fatal("a Terra vê só a visão da Terra")
	}
	if mars.Mars == nil || mars.Earth != nil || mars.Mars.Storms != nil {
		t.Fatal("Marte não vê a previsão nem a agenda de tempestades")
	}
}

func TestRoomFull(t *testing.T) {
	r := newRoom("FULL", nil, nil, func() (uint32, uint32) { return 1, 1 })
	for i := 0; i < MaxPlayers; i++ {
		must(t, r.join(NewPlayer(nil)))
	}
	if err := r.join(NewPlayer(nil)); !errors.Is(err, errRoomFull) {
		t.Fatal("sala com 5 jogadores deveria recusar o sexto")
	}
}

func TestRoomCodeHasNoVowels(t *testing.T) {
	for i := 0; i < 500; i++ {
		if strings.ContainsAny(randomCode(), "AEIOU") {
			t.Fatal("código não pode ter vogais (evita formar palavras)")
		}
	}
}

// ---------- ponta a ponta, por WebSocket ----------

func TestFullGameOverWebSocket(t *testing.T) {
	hub := NewHub(nil, nil)
	hub.TimeScale = 200
	srv := httptest.NewServer(&WSHandler{Hub: hub, OriginPatterns: []string{"*"}, Log: slog.New(slog.NewTextHandler(io.Discard, nil)), MaxPerSec: 10000})
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	mars := dial(t, ctx, srv.URL)
	mars.send(t, ctx, Action{T: "create"})
	w := mars.waitFor(t, ctx, "welcome")
	code := w["code"].(string)

	earth := dial(t, ctx, srv.URL)
	earth.send(t, ctx, Action{T: "join", Code: code})
	earth.waitFor(t, ctx, "welcome")

	mars.send(t, ctx, Action{T: "claim", Role: Commander})
	earth.send(t, ctx, Action{T: "claim", Role: Earth})
	time.Sleep(50 * time.Millisecond)
	mars.send(t, ctx, Action{T: "start"})

	var end StateMsg
	for sol := 1; ; sol++ {
		if sol > sim.Config.Sols+1 {
			t.Fatal("a partida deveria ter terminado")
		}
		st := earth.waitState(t, ctx, func(s StateMsg) bool { return s.Phase == PhaseEarth || s.Phase == PhaseEnded })
		if st.Phase == PhaseEnded {
			end = mars.waitState(t, ctx, func(s StateMsg) bool { return s.Phase == PhaseEnded })
			break
		}
		earth.send(t, ctx, Action{T: "earth", Option: "none"})
		ms := mars.waitState(t, ctx, func(s StateMsg) bool { return s.Phase == PhaseMars && s.Mars != nil && s.Mars.Sol == sol })
		if c := ms.Mars.PendingCard; c != nil {
			mars.send(t, ctx, Action{T: "card", Option: c.Options[0].ID})
			ms = mars.waitState(t, ctx, func(s StateMsg) bool {
				return s.Phase == PhaseEnded || (s.Mars != nil && s.Mars.PendingCard == nil)
			})
			if ms.Phase == PhaseEnded {
				end = ms
				break
			}
		}
		mars.send(t, ctx, Action{T: "end_sol"})
	}
	if end.Mars.Outcome.Status == "playing" || end.Mars.Storms == nil {
		t.Fatalf("fim de partida inesperado: %+v", end.Mars.Outcome)
	}
}

func TestRejoinWithToken(t *testing.T) {
	hub := NewHub(nil, nil)
	hub.TimeScale = 200
	srv := httptest.NewServer(&WSHandler{Hub: hub, OriginPatterns: []string{"*"}, Log: slog.New(slog.NewTextHandler(io.Discard, nil)), MaxPerSec: 10000})
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	a := dial(t, ctx, srv.URL)
	a.send(t, ctx, Action{T: "create"})
	w := a.waitFor(t, ctx, "welcome")
	a.conn.CloseNow() // a internet caiu

	b := dial(t, ctx, srv.URL)
	b.send(t, ctx, Action{T: "rejoin", Code: w["code"].(string), Token: w["token"].(string)})
	st := b.waitState(t, ctx, func(s StateMsg) bool { return s.You.ID == w["playerId"] })
	if !st.You.Host {
		t.Fatal("ao reconectar, o jogador volta como o mesmo (anfitrião)")
	}
}

// ---------- ajudantes ----------

func answerAnyCard(t *testing.T, g *Game) {
	t.Helper()
	if c := g.Mission.State.PendingCard; c != nil && g.Phase == PhaseMars {
		must(t, g.AnswerCard(c.Options[0].ID))
	}
}

func safePlan(g *Game) {
	if g.Phase != PhaseMars {
		return
	}
	b := g.Mission.State.Blocks
	_ = g.SetBlocks("science", 0)
	_ = g.SetBlocks("shield", 0)
	_ = g.SetBlocks("life", min(3, b))
	_ = g.SetBlocks("shield", min(4, b-min(3, b)))
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

type client struct{ conn *websocket.Conn }

func dial(t *testing.T, ctx context.Context, url string) *client {
	t.Helper()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(url, "http")+"/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	return &client{conn: c}
}

func (c *client) send(t *testing.T, ctx context.Context, a Action) {
	t.Helper()
	b, _ := json.Marshal(a)
	if err := c.conn.Write(ctx, websocket.MessageText, b); err != nil {
		t.Fatal(err)
	}
}

func (c *client) waitFor(t *testing.T, ctx context.Context, kind string) map[string]any {
	t.Helper()
	for {
		_, data, err := c.conn.Read(ctx)
		if err != nil {
			t.Fatalf("esperando %s: %v", kind, err)
		}
		var m map[string]any
		_ = json.Unmarshal(data, &m)
		if m["t"] == "error" {
			t.Fatalf("erro do servidor: %v", m["code"])
		}
		if m["t"] == kind {
			return m
		}
	}
}

func (c *client) waitState(t *testing.T, ctx context.Context, ok func(StateMsg) bool) StateMsg {
	t.Helper()
	for {
		_, data, err := c.conn.Read(ctx)
		if err != nil {
			t.Fatalf("esperando estado: %v", err)
		}
		var head struct {
			T    string `json:"t"`
			Code string `json:"code"`
		}
		_ = json.Unmarshal(data, &head)
		if head.T == "error" {
			t.Fatalf("erro do servidor: %s", head.Code)
		}
		if head.T != "state" {
			continue
		}
		var s StateMsg
		_ = json.Unmarshal(data, &s)
		if ok(s) {
			return s
		}
	}
}

// ---------- dia em tempo real (problemas pela base) ----------

// dayGame devolve uma partida já no primeiro sol que tem problemas, com a carta respondida.
func dayGame(t *testing.T, seed uint32) *Game {
	t.Helper()
	g := NewGame(seed, seed, nil, nil, true)
	for g.Mission.State.Outcome.Status == "playing" {
		answerAnyCard(t, g)
		if len(g.Mission.State.Problems) > 0 {
			return g
		}
		safePlan(g)
		if err := g.StartDay(); err != nil { // sem problemas: vai direto para a noite
			t.Fatal(err)
		}
	}
	t.Fatal("nenhum sol com problemas")
	return nil
}

func TestDayClockOpensProblemsAndEnds(t *testing.T) {
	g := dayGame(t, 21)
	sol := g.Mission.State.Sol
	must(t, g.StartDay())
	if g.Phase != PhaseDay {
		t.Fatalf("com problemas, o dia começa; fase = %s", g.Phase)
	}
	if err := g.SetBlocks("life", 0); !errors.Is(err, ErrWrongPhase) {
		t.Fatal("durante o dia o plano está travado")
	}
	first := g.Mission.State.Problems[0]
	g.Tick(float64(first.SpawnAt) - 0.5)
	if g.Mission.State.Problems[0].Status != "pending" {
		t.Fatal("o problema não pode aparecer antes da hora")
	}
	g.Tick(1)
	if g.Mission.State.Problems[0].Status != "open" {
		t.Fatal("o problema aparece na hora marcada")
	}
	must(t, g.TogglePause())
	if g.Tick(100) || g.Phase != PhaseDay {
		t.Fatal("pausado, o relógio não anda")
	}
	must(t, g.TogglePause())
	g.Tick(80)
	if g.Phase == PhaseDay || g.Mission.State.Sol == sol && g.Phase != PhaseEnded {
		t.Fatalf("aos 75 s o dia acaba e vem a noite; fase = %s, sol = %d", g.Phase, g.Mission.State.Sol)
	}
}

func TestResolveAllEndsDayEarly(t *testing.T) {
	g := dayGame(t, 33)
	must(t, g.StartDay())
	g.Tick(36) // todos os problemas já apareceram (janela 3–35 s)
	for _, p := range g.Mission.State.Problems {
		must(t, g.ResolveProblem(p.UID))
		must(t, g.ResolveProblem(p.UID)) // dois jogadores consertando o mesmo: sem erro, sem dose em dobro
	}
	if g.Phase != PhaseDay {
		return // um conserto fora da base pode ter estourado a dose; ok
	}
	g.Tick(0.25)
	if g.Phase == PhaseDay {
		t.Fatal("tudo consertado: o dia termina na hora")
	}
}

func TestOnlyMarsFixesAndOnlyCommanderControlsDay(t *testing.T) {
	r := newRoom("DAYS", nil, nil, func() (uint32, uint32) { return 21, 21 })
	cmd, earth, med := NewPlayer(nil), NewPlayer(nil), NewPlayer(nil)
	must(t, r.join(cmd))
	must(t, r.join(earth))
	must(t, r.join(med))
	must(t, r.Handle(cmd.ID, Action{T: "claim", Role: Commander}))
	must(t, r.Handle(earth.ID, Action{T: "claim", Role: Earth}))
	must(t, r.Handle(med.ID, Action{T: "claim", Role: Medic}))
	must(t, r.Handle(cmd.ID, Action{T: "start"}))
	if err := r.Handle(med.ID, Action{T: "start_day"}); !errors.Is(err, ErrNotYourRole) && !errors.Is(err, ErrWrongPhase) {
		t.Fatalf("só o comandante começa o dia: %v", err)
	}
	if err := r.Handle(earth.ID, Action{T: "problem_resolve", UID: 1}); !errors.Is(err, ErrNotYourRole) {
		t.Fatalf("a Terra não conserta problemas em Marte: %v", err)
	}
}

func TestAntennaDownLosesEarthMessage(t *testing.T) {
	for seed := uint32(1); seed < 400; seed++ {
		g := NewGame(seed, seed, nil, nil, false)
		for g.Mission.State.Outcome.Status == "playing" {
			if g.Phase == PhaseEarth {
				must(t, g.SendEarth("science"))
			}
			answerAnyCard(t, g)
			if g.Phase != PhaseMars {
				break
			}
			safePlan(g)
			must(t, g.StartDay())
			if g.Phase == PhaseDay {
				g.Tick(80) // ninguém conserta nada: a antena desalinhada derruba a mensagem de amanhã
			}
			if g.Mission.State.CommsDown && g.Phase != PhaseEnded {
				for _, m := range g.MarsMessages() {
					if m.Kind == "earth" {
						t.Fatalf("seed %d: com a antena desalinhada, a mensagem da Terra não chega", seed)
					}
				}
				return
			}
		}
	}
	t.Fatal("nenhuma partida com antena desalinhada")
}

func TestFirstRoomGameUsesMediumHistoricalMission(t *testing.T) {
	raw, err := os.ReadFile("../../../public/data/missions.json")
	if err != nil {
		t.Skip("sem public/data/missions.json")
	}
	missions := sim.ParseMissions(raw)
	if len(missions) == 0 {
		t.Fatal("missões históricas não carregaram")
	}
	for seed := uint32(1); seed < 50; seed++ {
		r := newRoom("HIST", nil, missions, func() (uint32, uint32) { return seed, seed })
		p := NewPlayer(nil)
		must(t, r.join(p))
		must(t, r.Handle(p.ID, Action{T: "claim", Role: Commander}))
		must(t, r.Handle(p.ID, Action{T: "start"}))
		if h := r.game.Mission.State.Historical; h == nil || h.Difficulty != "medium" {
			t.Fatalf("seed %d: primeira partida deveria ser missão histórica média", seed)
		}
	}
}
