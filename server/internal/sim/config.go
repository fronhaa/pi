// Package sim é a porta em Go da simulação pura da missão (src/sim/*.ts).
//
// REGRA: o comportamento precisa ser IDÊNTICO ao TypeScript. O teste de paridade
// (mission_test.go) compara, passo a passo, contra traços gerados pela versão TS
// (npm run sim:golden). Mudou uma regra em src/sim? Mude aqui e regenere os traços.
package sim

// Config espelha src/sim/config.ts. Números simplificados para o jogo (INTERPRETADO).
var Config = struct {
	Sols int

	PanelBlocks, MinBlocks int

	BatteryStart, BatteryPerLeftoverBlock, BatteryNightCost, BatteryMax float64
	BatteryLifePerMissingPoint                                          float64

	LifeStart      float64
	LifeStableBlks int
	LifePerBlock   float64
	LifeMax        float64

	ShieldStart, ShieldDecay, ShieldPerBlock, ShieldMax float64

	DoseStart, DosePerSol, DoseMax, DoseShieldFactor float64

	SciencePerBlock, ScienceStormFactor, ScienceGoal float64

	DustWindCleanPerSol, DustMax, DustStormAdd float64
	DustStormHoldSols                          int

	StormCount, StormFirstSol, StormLastSol, StormMinGap int
	StormIntensity                                       map[FlareClass]float64
	CommDelayMin, CommDelayMax                           int

	DustStormFirstSol, DustStormLastSol int

	CardsPerGame, CardsFirstSol, CardsLastSol int

	StarsDoseFor3 float64
}{
	Sols: 15,

	PanelBlocks: 10, MinBlocks: 2,

	BatteryStart: 50, BatteryPerLeftoverBlock: 10, BatteryNightCost: 20, BatteryMax: 100,
	BatteryLifePerMissingPoint: 0.6,

	LifeStart: 70, LifeStableBlks: 3, LifePerBlock: 6, LifeMax: 100,

	ShieldStart: 40, ShieldDecay: 4, ShieldPerBlock: 8, ShieldMax: 100,

	DoseStart: 0, DosePerSol: 1, DoseMax: 100, DoseShieldFactor: 0.85,

	SciencePerBlock: 3, ScienceStormFactor: 0.5, ScienceGoal: 100,

	DustWindCleanPerSol: 6, DustMax: 80, DustStormAdd: 40, DustStormHoldSols: 3,

	StormCount: 3, StormFirstSol: 4, StormLastSol: 14, StormMinGap: 2,
	StormIntensity: map[FlareClass]float64{"C": 10, "M": 25, "X": 45},
	CommDelayMin:   3, CommDelayMax: 22,

	DustStormFirstSol: 3, DustStormLastSol: 12,

	CardsPerGame: 4, CardsFirstSol: 2, CardsLastSol: 14,

	StarsDoseFor3: 50,
}
