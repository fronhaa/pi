package sim

// Tipos espelham src/sim/types.ts. As tags JSON usam os mesmos nomes do TS,
// para o cliente reaproveitar a interface sem conversão.

type FlareClass string

// Flare é a erupção que dispara uma tempestade. Real = veio do DONKI.
type Flare struct {
	Cls   FlareClass `json:"cls"`
	Label string     `json:"label"`
	Real  bool       `json:"real"`
	Time  string     `json:"time,omitempty"`
	Link  string     `json:"link,omitempty"`
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
type Message struct {
	Kind      string `json:"kind"`
	Flare     *Flare `json:"flare,omitempty"`
	DelayMin  int    `json:"delayMin,omitempty"`
	ImpactSol int    `json:"impactSol,omitempty"`
	Sol       int    `json:"sol,omitempty"`
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
	Sol      int   `json:"sol"`
	Flare    Flare `json:"flare"`
	DelayMin int   `json:"delayMin"`
}

type GameState struct {
	Seed         uint32
	Sol          int
	Res          Resources
	Blocks       int
	Storms       []ScheduledStorm
	DustStormSol int
	DustHold     int
	CardSols     map[int]CardID
	PendingCard  *Card
	Messages     []Message
	Reports      []SolReport
	Outcome      Outcome
}
