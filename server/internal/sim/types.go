package sim

import (
	"encoding/json"
	"strconv"
)

// Tipos espelham src/sim/types.ts. As tags JSON usam os mesmos nomes do TS,
// para o cliente reaproveitar a interface sem conversão.

type FlareClass string

// Flare é o evento solar que dispara uma tempestade. Real = veio do DONKI.
// Source "cme" = ejeção de massa coronal de missão histórica; vazio = erupção.
type Flare struct {
	Cls      FlareClass     `json:"cls"`
	Label    string         `json:"label"`
	Real     bool           `json:"real"`
	Time     string         `json:"time,omitempty"`
	Link     string         `json:"link,omitempty"`
	Source   string         `json:"source,omitempty"`
	SpeedKmS NullableNumber `json:"speedKmS,omitzero"`
}

// NullableNumber reproduz um campo TS `number | null` que pode também estar ausente:
// ausente (Set=false) some do JSON; Set e !Valid vira null; Set e Valid vira o número.
type NullableNumber struct {
	Set   bool
	Valid bool
	V     float64
}

func (n NullableNumber) IsZero() bool { return !n.Set }

func (n NullableNumber) MarshalJSON() ([]byte, error) {
	if !n.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(n.V)
}

func (n *NullableNumber) UnmarshalJSON(b []byte) error {
	n.Set = true
	if string(b) == "null" {
		n.Valid = false
		return nil
	}
	v, err := strconv.ParseFloat(string(b), 64)
	if err != nil {
		return err
	}
	n.Valid, n.V = true, v
	return nil
}

type Resources struct {
	Battery float64 `json:"battery"`
	Life    float64 `json:"life"`
	Shield  float64 `json:"shield"`
	Dose    float64 `json:"dose"`
	Science float64 `json:"science"`
	Dust    float64 `json:"dust"`
}

type EnergyPlan struct {
	Life    int `json:"life"`
	Shield  int `json:"shield"`
	Science int `json:"science"`
}

type CardID string

type CardOption struct {
	ID string `json:"id"`
}

type Card struct {
	ID      CardID       `json:"id"`
	Options []CardOption `json:"options"`
}

// Message é a união de src/sim/types.ts (Message). Campos ausentes ficam de fora do JSON.
// DelayMin é float: nas missões históricas é o atraso real (ex.: 9,4 min).
type Message struct {
	Kind      string  `json:"kind"`
	Flare     *Flare  `json:"flare,omitempty"`
	DelayMin  float64 `json:"delayMin,omitempty"`
	ImpactSol int     `json:"impactSol,omitempty"`
	Sol       int     `json:"sol,omitempty"`
}

type ReportLine struct {
	Key    string         `json:"key"`
	Params map[string]any `json:"params,omitempty"`
	Tone   string         `json:"tone,omitempty"`
}

type StormResult struct {
	Flare Flare   `json:"flare"`
	Dose  float64 `json:"dose"`
}

type SolReport struct {
	Sol    int          `json:"sol"`
	Plan   EnergyPlan   `json:"plan"`
	Before Resources    `json:"before"`
	After  Resources    `json:"after"`
	Storm  *StormResult `json:"storm"`
	Lines  []ReportLine `json:"lines"`
}

type Outcome struct {
	Status string `json:"status"` // playing | lost | won
	Reason string `json:"reason,omitempty"`
	Sol    int    `json:"sol,omitempty"`
	Stars  int    `json:"stars,omitempty"`
}

type ScheduledStorm struct {
	Sol      int     `json:"sol"`
	Flare    Flare   `json:"flare"`
	DelayMin float64 `json:"delayMin"`
}

type ProblemKind string

// Problem espelha Problem de src/sim/types.ts (tempo da tripulação).
type Problem struct {
	UID      int         `json:"uid"`
	Kind     ProblemKind `json:"kind"`
	SpawnAt  int         `json:"spawnAt"`
	Status   string      `json:"status"` // pending | open | done
	Progress float64     `json:"progress"`
}

// HistoricalMission espelha HistoricalMission (15 sóis reais do passado).
type HistoricalMission struct {
	ID         int    `json:"id"`
	Difficulty string `json:"difficulty"`
	StartUtc   string `json:"startUtc"`
	EndUtc     string `json:"endUtc"`
	Storms     []struct {
		Sol   int   `json:"sol"`
		Flare Flare `json:"flare"`
	} `json:"storms"`
	Delays []float64 `json:"delays"`
}

type GameState struct {
	Seed         uint32
	Historical   *HistoricalMission
	Sol          int
	Res          Resources
	Blocks       int
	Storms       []ScheduledStorm
	DustStormSol int
	DustHold     int
	CardSols     map[int]CardID
	PendingCard  *Card
	Messages     []Message
	Problems     []Problem
	CommsDown    bool
	Reports      []SolReport
	Outcome      Outcome
}
