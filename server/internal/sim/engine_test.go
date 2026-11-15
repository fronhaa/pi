package sim

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
)

// TestStateRoundTrip: o estado que o sim.js devolve precisa passar pelos structs Go SEM PERDER
// NADA (é isso que o servidor manda aos jogadores). Joga partidas aleatórias com todas as ações.
// Falhou? Um campo novo em src/sim/types.ts não existe em types.go: acrescente lá.
func TestStateRoundTrip(t *testing.T) {
	flares := loadFlaresForTest(t)
	missions := loadMissionsForTest(t)
	games := 0
	for seed := uint32(1); seed <= 150; seed++ {
		var hist *HistoricalMission
		if len(missions) > 0 && seed%3 == 0 {
			hist = &missions[int(seed)%len(missions)]
		}
		var fl []Flare
		if seed%2 == 0 {
			fl = flares
		}
		m := NewMission(seed, fl, hist, "medium")
		r := NewRng(seed ^ 0x5bd1e995)
		check := func(step string) {
			t.Helper()
			js, err := m.e.call("state")
			if err != nil {
				t.Fatal(err)
			}
			goJSON, _ := json.Marshal(m.State)
			if a, b := canonical(t, []byte(js.String())), canonical(t, goJSON); a != b {
				t.Fatalf("seed %d, %s: o estado perdeu informação no Go\nJS: %s\nGo: %s", seed, step, a, b)
			}
		}
		check("início")
		for m.State.Outcome.Status == "playing" {
			if c := m.State.PendingCard; c != nil {
				if _, err := m.AnswerCard(c.Options[r.Int(0, len(c.Options)-1)].ID); err != nil {
					t.Fatal(err)
				}
				check("carta")
				if m.State.Outcome.Status != "playing" {
					break
				}
			}
			for _, p := range m.State.Problems {
				if m.State.Outcome.Status != "playing" {
					break
				}
				must(t, m.OpenProblem(p.UID))
				switch x := r.Next(); {
				case x < 0.5:
					must(t, m.ResolveProblem(p.UID))
				case x < 0.8:
					must(t, m.SetProblemProgress(p.UID, float64(r.Int(1, 99))/100))
				}
				check("problema")
			}
			if m.State.Outcome.Status != "playing" {
				break
			}
			b := m.State.Blocks
			life := r.Int(0, b)
			shield := r.Int(0, b-life)
			plan := EnergyPlan{Life: life, Shield: shield, Science: r.Int(0, b-life-shield)}
			if !m.IsPlanValid(plan) {
				t.Fatalf("plano válido recusado: %+v (blocos %d)", plan, b)
			}
			rep, err := m.EndSol(plan)
			if err != nil {
				t.Fatal(err)
			}
			if rep.Sol == 0 || len(rep.Lines) == 0 {
				t.Fatalf("relatório vazio: %+v", rep)
			}
			check("fim do sol")
		}
		games++
	}
	t.Logf("%d partidas sem perder nenhum campo entre JS e Go", games)
}

func TestRulesRefuseInvalidActions(t *testing.T) {
	m := NewMission(5, nil, nil, "medium")
	if m.IsPlanValid(EnergyPlan{Life: 99}) {
		t.Fatal("plano acima dos blocos deveria ser inválido")
	}
	if _, err := m.EndSol(EnergyPlan{Life: 99}); !errors.Is(err, ErrRule) {
		t.Fatalf("a regra deveria recusar: %v", err)
	}
	if _, err := m.AnswerCard("nao-existe"); !errors.Is(err, ErrRule) {
		t.Fatalf("sem carta pendente, deveria recusar: %v", err)
	}
	if err := m.ResolveProblem(999); !errors.Is(err, ErrRule) {
		t.Fatalf("problema inexistente deveria ser recusado: %v", err)
	}
	if m.State.Sol != 1 || m.State.Outcome.Status != "playing" {
		t.Fatal("ação recusada não pode mudar o estado")
	}
}

func TestConfigComesFromTypeScript(t *testing.T) {
	if Config.Sols != 15 || Config.StormCount != 3 || Config.CommDelayMin != 3 || Config.CommDelayMax != 22 || Config.ProblemsDaySeconds != 75 {
		t.Fatalf("Config não bate com src/sim/config.ts: %+v", Config)
	}
}

func TestHistoricalMissions(t *testing.T) {
	missions := loadMissionsForTest(t)
	if len(missions) == 0 {
		t.Skip("sem public/data/missions.json")
	}
	for seed := uint32(1); seed < 40; seed++ {
		h := PickHistorical(missions, seed, true, "medium")
		if h == nil || h.Difficulty != "medium" {
			t.Fatalf("seed %d: primeira partida deveria ser missão média", seed)
		}
		if m := NewMission(seed, nil, h, "medium"); m.State.Historical == nil || m.State.Historical.ID != h.ID {
			t.Fatal("a missão deveria usar a missão histórica escolhida")
		}
	}
}

func TestMissionsAreIsolated(t *testing.T) {
	a, b := NewMission(1, nil, nil, "medium"), NewMission(1, nil, nil, "medium")
	if a.State.PendingCard != nil {
		_, _ = a.AnswerCard(a.State.PendingCard.Options[0].ID)
	}
	if _, err := a.EndSol(EnergyPlan{Life: 3}); err != nil {
		t.Fatal(err)
	}
	if b.State.Sol != 1 {
		t.Fatal("duas salas não podem compartilhar a mesma missão")
	}
}

// ---------- ajudantes ----------

func canonical(t *testing.T, raw []byte) string {
	t.Helper()
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v) // map[string]any sai com as chaves ordenadas
	return buf.String()
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func loadFlaresForTest(t *testing.T) []Flare {
	raw, err := os.ReadFile("../../../public/data/donki-flares.json")
	if err != nil {
		return nil
	}
	var f struct {
		Flares []struct{ Time, Cls, Link string } `json:"flares"`
	}
	if json.Unmarshal(raw, &f) != nil {
		t.Fatal("donki-flares.json inválido")
	}
	var out []Flare
	for _, x := range f.Flares {
		if x.Cls != "" && (x.Cls[0] == 'M' || x.Cls[0] == 'X') {
			out = append(out, Flare{Cls: FlareClass(x.Cls[:1]), Label: x.Cls, Real: true, Time: x.Time, Link: x.Link})
		}
	}
	return out
}

func loadMissionsForTest(t *testing.T) []HistoricalMission {
	raw, err := os.ReadFile("../../../public/data/missions.json")
	if err != nil {
		return nil
	}
	return ParseMissions(raw)
}

// Níveis (src/sim/config.ts, DIFFICULTY): o servidor lê do TypeScript e a missão nasce com o nível pedido.
func TestLevelsComeFromTypeScript(t *testing.T) {
	want := map[string]float64{"easy": 90, "medium": 75, "hard": 60}
	for level, s := range want {
		if !IsLevel(level) || DaySeconds(level) != s {
			t.Fatalf("nível %s: IsLevel=%v DaySeconds=%v (esperado %v)", level, IsLevel(level), DaySeconds(level), s)
		}
	}
	if IsLevel("impossible") || DaySeconds("impossible") != Config.ProblemsDaySeconds {
		t.Fatal("nível desconhecido não vale e usa o dia de sempre")
	}
}

func TestMissionLevelChangesOnlyGameScale(t *testing.T) {
	easy, medium, hard := NewMission(3, nil, nil, "easy"), NewMission(3, nil, nil, "medium"), NewMission(3, nil, nil, "hard")
	if easy.State.Difficulty != "easy" || hard.State.Difficulty != "hard" {
		t.Fatalf("nível no estado: %q %q", easy.State.Difficulty, hard.State.Difficulty)
	}
	if !(easy.State.Blocks > medium.State.Blocks && medium.State.Blocks > hard.State.Blocks) {
		t.Fatalf("blocos por nível: %d %d %d", easy.State.Blocks, medium.State.Blocks, hard.State.Blocks)
	}
	// Dado real da NASA não muda com o nível: as tempestades (sol, força, atraso) são as mesmas.
	if !reflect.DeepEqual(easy.State.Storms, medium.State.Storms) || !reflect.DeepEqual(medium.State.Storms, hard.State.Storms) {
		t.Fatal("as tempestades não podem mudar com o nível")
	}
	if NewMission(3, nil, nil, "impossible").State.Difficulty != "medium" {
		t.Fatal("nível desconhecido vira medium")
	}
}
