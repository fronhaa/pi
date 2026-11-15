// Package sim roda as REGRAS do jogo para o servidor coop.
//
// As regras existem num lugar só: src/sim (TypeScript). `npm run sim:bundle` (também
// dentro do `npm run build`) empacota src/sim em simjs/sim.js, que este pacote embute no
// binário e executa com goja (motor JavaScript em Go puro). Ver ADR 0006.
//
// Daqui para fora a interface é Go: NewMission, Mission.AnswerCard, Mission.EndSol…
// O estado volta como JSON e vira GameState a cada ação.
package sim

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/dop251/goja"
)

//go:embed simjs/sim.js
var bundle string

// program é compilado uma vez e reaproveitado por todas as missões.
var program = goja.MustCompile("sim.js", bundle, true)

// ErrRule: a regra recusou a ação (opção inválida, plano acima dos blocos, missão encerrada…).
var ErrRule = errors.New("regra recusou a ação")

type engine struct {
	vm  *goja.Runtime
	api *goja.Object
}

func newEngine() *engine {
	vm := goja.New()
	if _, err := vm.RunProgram(program); err != nil {
		panic(fmt.Sprintf("sim.js não carregou (rode npm run sim:bundle): %v", err))
	}
	return &engine{vm: vm, api: vm.Get("JezeroSim").ToObject(vm)}
}

func (e *engine) call(name string, args ...any) (goja.Value, error) {
	fn, ok := goja.AssertFunction(e.api.Get(name))
	if !ok {
		return nil, fmt.Errorf("sim.js sem a função %q (rode npm run sim:bundle)", name)
	}
	vals := make([]goja.Value, len(args))
	for i, a := range args {
		vals[i] = e.vm.ToValue(a)
	}
	v, err := fn(goja.Undefined(), vals...)
	if err != nil {
		var ex *goja.Exception
		if errors.As(err, &ex) {
			return nil, fmt.Errorf("%w: %s", ErrRule, ex.Value().String())
		}
		return nil, err
	}
	return v, nil
}

// helper roda as funções sem missão (config, missões históricas). goja não é thread-safe.
var (
	helperMu sync.Mutex
	helper   = newEngine()
)

func helperCall(name string, args ...any) (string, error) {
	helperMu.Lock()
	defer helperMu.Unlock()
	v, err := helper.call(name, args...)
	if err != nil {
		return "", err
	}
	return v.String(), nil
}

// Config: os números de jogo que o servidor usa, lidos de src/sim/config.ts (CONFIG).
var Config = loadConfig()

type config struct {
	Sols               int
	StormCount         int
	CommDelayMin       int
	CommDelayMax       int
	ProblemsDaySeconds float64
	// Duração do dia por nível (src/sim/config.ts, DIFFICULTY). As chaves são os níveis válidos.
	DaySecondsByLevel map[string]float64
}

// DefaultLevel: nível de quem não escolheu (o jogo de sempre).
const DefaultLevel = "medium"

// IsLevel: o nível existe em src/sim/config.ts?
func IsLevel(level string) bool {
	_, ok := Config.DaySecondsByLevel[level]
	return ok
}

// DaySeconds: duração do dia do nível (nível desconhecido = o de sempre).
func DaySeconds(level string) float64 {
	if s, ok := Config.DaySecondsByLevel[level]; ok {
		return s
	}
	return Config.ProblemsDaySeconds
}

func loadConfig() config {
	raw, err := helperCall("config")
	if err != nil {
		panic(err)
	}
	var c struct {
		Sols        int `json:"sols"`
		SolarStorms struct {
			Count        int `json:"count"`
			CommDelayMin struct {
				Min int `json:"min"`
				Max int `json:"max"`
			} `json:"commDelayMin"`
		} `json:"solarStorms"`
		Problems struct {
			DaySeconds float64 `json:"daySeconds"`
		} `json:"problems"`
		Difficulty map[string]struct {
			DaySeconds float64 `json:"daySeconds"`
		} `json:"difficulty"`
	}
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		panic(err)
	}
	byLevel := map[string]float64{}
	for level, t := range c.Difficulty {
		byLevel[level] = t.DaySeconds
	}
	return config{
		Sols: c.Sols, StormCount: c.SolarStorms.Count,
		CommDelayMin: c.SolarStorms.CommDelayMin.Min, CommDelayMax: c.SolarStorms.CommDelayMin.Max,
		ProblemsDaySeconds: c.Problems.DaySeconds,
		DaySecondsByLevel:  byLevel,
	}
}

// ---------- missão ----------

// Mission é uma partida. Cada uma tem o próprio runtime JS (uma sala = uma missão).
// Não é segura para uso concorrente: a sala chama tudo com o próprio mutex.
type Mission struct {
	State GameState
	e     *engine
}

// NewMission: historical != nil usa as tempestades e os atrasos reais da missão histórica.
// level: nível da missão ("easy", "medium", "hard"); desconhecido vira "medium" (regra no sim.js).
func NewMission(seed uint32, realFlares []Flare, historical *HistoricalMission, level string) *Mission {
	if realFlares == nil {
		realFlares = []Flare{}
	}
	fj, _ := json.Marshal(realFlares)
	hj, _ := json.Marshal(historical)
	m := &Mission{e: newEngine()}
	if _, err := m.e.call("newMission", seed, string(fj), string(hj), "mars", level); err != nil {
		panic(err)
	}
	m.refresh()
	return m
}

func (m *Mission) refresh() {
	v, err := m.e.call("state")
	if err != nil {
		panic(err)
	}
	m.State = GameState{}
	if err := json.Unmarshal([]byte(v.String()), &m.State); err != nil {
		panic(fmt.Sprintf("estado do sim.js não bate com GameState: %v", err))
	}
}

// do executa uma ação e atualiza State (mesmo se a regra recusou: o estado continua válido).
func (m *Mission) do(name string, args ...any) (goja.Value, error) {
	v, err := m.e.call(name, args...)
	m.refresh()
	return v, err
}

func (m *Mission) AnswerCard(optionID string) ([]ReportLine, error) {
	_, err := m.do("answerCard", optionID)
	return nil, err
}

func (m *Mission) IsPlanValid(p EnergyPlan) bool {
	pj, _ := json.Marshal(p)
	v, err := m.e.call("isPlanValid", string(pj))
	return err == nil && v.ToBoolean()
}

func (m *Mission) EndSol(plan EnergyPlan) (SolReport, error) {
	pj, _ := json.Marshal(plan)
	v, err := m.do("endSol", string(pj))
	if err != nil {
		return SolReport{}, err
	}
	var r SolReport
	err = json.Unmarshal([]byte(v.String()), &r)
	return r, err
}

// PreviewSol: prévia do plano calculada pelas regras (Mission.previewSol). JSON pronto para o
// cliente; null se ainda há carta ou o plano é inválido.
func (m *Mission) PreviewSol(plan EnergyPlan) (json.RawMessage, error) {
	pj, _ := json.Marshal(plan)
	v, err := m.e.call("previewSol", string(pj))
	if err != nil {
		return nil, err
	}
	return json.RawMessage(v.String()), nil
}

// EvaBanned: EVA proibida hoje (regra em Mission.evaBanned, src/sim/mission.ts).
func (m *Mission) EvaBanned() bool {
	v, err := m.e.call("evaBanned")
	return err == nil && v.ToBoolean()
}

// CanResolve: o problema pode ser consertado agora (com a EVA proibida, os de fora não).
func (m *Mission) CanResolve(uid int) bool {
	v, err := m.e.call("canResolve", uid)
	return err == nil && v.ToBoolean()
}

func (m *Mission) OpenProblem(uid int) error {
	_, err := m.do("openProblem", uid)
	return err
}

func (m *Mission) SetProblemProgress(uid int, progress float64) error {
	_, err := m.do("setProblemProgress", uid, progress)
	return err
}

func (m *Mission) ResolveProblem(uid int) error {
	_, err := m.do("resolveProblem", uid)
	return err
}

// ---------- missões históricas ----------

// ParseMissions lê public/data/missions.json com a MESMA regra do jogo (src/sim/historical.ts).
func ParseMissions(raw []byte) []HistoricalMission {
	out, err := helperCall("parseMissionsJson", string(raw))
	if err != nil {
		return nil
	}
	var m []HistoricalMission
	if json.Unmarshal([]byte(out), &m) != nil {
		return nil
	}
	return m
}

// PickHistorical: sorteio da missão histórica pelo nível (regra em src/sim/historical.ts). No Médio, a primeira
// partida só tem missões de força média; depois, qualquer uma.
func PickHistorical(missions []HistoricalMission, seed uint32, firstGame bool, level string) *HistoricalMission {
	if len(missions) == 0 {
		return nil
	}
	mj, _ := json.Marshal(missions)
	out, err := helperCall("pickHistoricalJson", string(mj), seed, firstGame, level)
	if err != nil {
		return nil
	}
	var h *HistoricalMission
	if json.Unmarshal([]byte(out), &h) != nil {
		return nil
	}
	return h
}
