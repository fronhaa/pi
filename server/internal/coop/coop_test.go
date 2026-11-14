package coop

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
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
	g := NewGame(1, 2, nil, false)
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
	auto := NewGame(7, 7, nil, true)
	withEarth := NewGame(7, 7, nil, false)
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
	g := NewGame(3, 3, nil, false)
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
		g := NewGame(seed, seed, nil, true)
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
	g := NewGame(11, 11, nil, true)
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
	r := newRoom("TEST", nil, func() (uint32, uint32) { return 5, 5 })
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
	r := newRoom("FULL", nil, func() (uint32, uint32) { return 1, 1 })
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
	hub := NewHub(nil)
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
	hub := NewHub(nil)
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
