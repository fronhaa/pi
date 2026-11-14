package sim

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"strconv"
	"testing"
)

// Teste de PARIDADE com a simulação TypeScript (a referência).
// Os traços vêm de `npm run sim:golden`: mesmas sementes, mesmas ações, mesmo hash por passo.

type goldenFile struct {
	Flares     []Flare             `json:"flares"`
	Historical []HistoricalMission `json:"historical"`
	Games      []struct {
		Seed       uint32 `json:"seed"`
		Real       bool   `json:"real"`
		Historical *int   `json:"historical"`
		Strategy   string `json:"strategy"`
		Actions    []struct {
			Card     *string     `json:"card"`
			Plan     *[3]int     `json:"plan"`
			Open     *int        `json:"open"`
			Progress *[2]float64 `json:"progress"`
			Resolve  *int        `json:"resolve"`
		} `json:"actions"`
		Hashes []string `json:"hashes"`
	} `json:"games"`
}

func TestParityWithTypeScript(t *testing.T) {
	raw, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Fatalf("sem traços: rode `npm run sim:golden` na raiz (%v)", err)
	}
	var g goldenFile
	if err := json.Unmarshal(raw, &g); err != nil {
		t.Fatal(err)
	}
	if len(g.Games) == 0 {
		t.Fatal("golden.json sem partidas")
	}

	for _, game := range g.Games {
		var flares []Flare
		if game.Real {
			flares = g.Flares
		}
		var hist *HistoricalMission
		if game.Historical != nil {
			hist = &g.Historical[*game.Historical]
		}
		m := NewMission(game.Seed, flares, hist)
		step := func(i int) {
			t.Helper()
			if got := stateHash(t, m); got != game.Hashes[i] {
				t.Fatalf("seed %d (%s, real=%v): diverge do TS no passo %d\nestado Go: %s",
					game.Seed, game.Strategy, game.Real, i, canonicalJSON(t, snapshotOf(m)))
			}
		}
		step(0)
		for i, a := range game.Actions {
			var err error
			switch {
			case a.Open != nil:
				err = m.OpenProblem(*a.Open)
			case a.Progress != nil:
				err = m.SetProblemProgress(int(a.Progress[0]), a.Progress[1])
			case a.Resolve != nil:
				err = m.ResolveProblem(*a.Resolve)
			case a.Card != nil:
				if _, err := m.AnswerCard(*a.Card); err != nil {
					t.Fatalf("seed %d passo %d: %v", game.Seed, i+1, err)
				}
			case a.Plan != nil:
				p := EnergyPlan{Life: a.Plan[0], Shield: a.Plan[1], Science: a.Plan[2]}
				if _, err := m.EndSol(p); err != nil {
					t.Fatalf("seed %d passo %d: %v", game.Seed, i+1, err)
				}
			}
			if err != nil {
				t.Fatalf("seed %d passo %d: %v", game.Seed, i+1, err)
			}
			step(i + 1)
		}
		if m.State.Outcome.Status == "playing" {
			t.Fatalf("seed %d: partida não terminou", game.Seed)
		}
	}
	t.Logf("%d partidas idênticas ao TypeScript", len(g.Games))
}

func TestJSRound(t *testing.T) {
	cases := map[float64]float64{2.5: 3, -2.5: -2, -0.5: 0, 0.49: 0, 1.5: 2, -1.5: -1}
	for in, want := range cases {
		if got := jsRound(in); got != want {
			t.Errorf("jsRound(%v) = %v, quer %v", in, got, want)
		}
	}
}

// snapshotOf monta o mesmo objeto que scripts/sim-golden.ts (snapshot).
func snapshotOf(m *Mission) any {
	s := m.State
	cardSols := map[string]CardID{}
	for k, v := range s.CardSols {
		cardSols[strconv.Itoa(k)] = v
	}
	reports := s.Reports
	if reports == nil {
		reports = []SolReport{}
	}
	problems := s.Problems
	if problems == nil {
		problems = []Problem{}
	}
	var historical any
	if s.Historical != nil {
		historical = s.Historical.ID
	}
	return map[string]any{
		"sol": s.Sol, "res": s.Res, "blocks": s.Blocks, "storms": s.Storms,
		"dustStormSol": s.DustStormSol, "dustHold": s.DustHold, "cardSols": cardSols,
		"pendingCard": s.PendingCard, "messages": s.Messages, "reports": reports, "outcome": s.Outcome,
		"problems": problems, "commsDown": s.CommsDown, "historical": historical,
	}
}

// canonicalJSON: ida e volta por `any` faz o encoding/json ordenar todas as chaves.
func canonicalJSON(t *testing.T, v any) string {
	t.Helper()
	first, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var generic any
	if err := json.Unmarshal(first, &generic); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false) // o JSON.stringify não escapa < > &
	if err := enc.Encode(generic); err != nil {
		t.Fatal(err)
	}
	return string(bytes.TrimRight(buf.Bytes(), "\n"))
}

func stateHash(t *testing.T, m *Mission) string {
	sum := sha256.Sum256([]byte(canonicalJSON(t, snapshotOf(m))))
	return hex.EncodeToString(sum[:])[:16]
}
