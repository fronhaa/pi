package sim

import (
	"errors"
	"fmt"
	"math"
	"slices"
)

// Mission espelha a classe Mission de src/sim/mission.ts.
// A ORDEM das chamadas ao Rng é parte do contrato: mudar a ordem muda as partidas.
type Mission struct {
	State     GameState
	rng       *Rng
	cardLines []ReportLine
}

var (
	ErrNoPendingCard = errors.New("nenhuma carta pendente")
	ErrInvalidOption = errors.New("opção inválida")
	ErrMissionOver   = errors.New("missão já terminou")
	ErrCardPending   = errors.New("responda a carta antes de terminar o sol")
	ErrInvalidPlan   = errors.New("plano de energia inválido")
)

func NewMission(seed uint32, realFlares []Flare) *Mission {
	m := &Mission{rng: NewRng(seed)}
	storms := m.scheduleStorms(realFlares)
	stormSols := map[int]bool{}
	for _, s := range storms {
		stormSols[s.Sol] = true
	}

	dustStormSol := m.rng.Int(Config.DustStormFirstSol, Config.DustStormLastSol)
	for stormSols[dustStormSol] {
		dustStormSol = m.rng.Int(Config.DustStormFirstSol, Config.DustStormLastSol)
	}

	var candidates []int
	for _, s := range rangeInts(Config.CardsFirstSol, Config.CardsLastSol) {
		if s != dustStormSol {
			candidates = append(candidates, s)
		}
	}
	sols := Shuffle(m.rng, candidates)[:Config.CardsPerGame]
	ids := Shuffle(m.rng, CardIDs)[:Config.CardsPerGame]
	cardSols := map[int]CardID{}
	for i, s := range sols {
		cardSols[s] = ids[i]
	}

	m.State = GameState{
		Seed: seed,
		Res: Resources{
			Battery: Config.BatteryStart,
			Life:    Config.LifeStart,
			Shield:  Config.ShieldStart,
			Dose:    Config.DoseStart,
		},
		Blocks:       Config.PanelBlocks,
		Storms:       storms,
		DustStormSol: dustStormSol,
		CardSols:     cardSols,
		Outcome:      Outcome{Status: "playing"},
	}
	m.startSol(1)
	return m
}

// ---------- agenda ----------

func (m *Mission) scheduleStorms(realFlares []Flare) []ScheduledStorm {
	var sols []int
	for tries := 0; tries < 1000; tries++ {
		sols = Shuffle(m.rng, rangeInts(Config.StormFirstSol, Config.StormLastSol))[:Config.StormCount]
		slices.Sort(sols)
		ok := true
		for i := 1; i < len(sols); i++ {
			if sols[i]-sols[i-1] < Config.StormMinGap {
				ok = false
				break
			}
		}
		if ok {
			break
		}
	}
	var flares []Flare
	if len(realFlares) >= Config.StormCount {
		flares = Shuffle(m.rng, realFlares)[:Config.StormCount]
	} else {
		for range sols {
			flares = append(flares, m.simulatedFlare())
		}
	}
	out := make([]ScheduledStorm, len(sols))
	for i, sol := range sols {
		out[i] = ScheduledStorm{Sol: sol, Flare: flares[i], DelayMin: m.rng.Int(Config.CommDelayMin, Config.CommDelayMax)}
	}
	return out
}

func (m *Mission) simulatedFlare() Flare {
	r := m.rng.Next()
	cls := FlareClass("X")
	if r < 0.3 {
		cls = "C"
	} else if r < 0.7 {
		cls = "M"
	}
	return Flare{Cls: cls, Label: string(cls), Real: false}
}

// ---------- ciclo do sol ----------

// StormToday devolve a tempestade do sol atual, se houver.
func (m *Mission) StormToday() *ScheduledStorm {
	for i := range m.State.Storms {
		if m.State.Storms[i].Sol == m.State.Sol {
			return &m.State.Storms[i]
		}
	}
	return nil
}

func (m *Mission) startSol(sol int) {
	s := &m.State
	s.Sol = sol

	if sol == s.DustStormSol {
		s.Res.Dust = math.Min(Config.DustMax, s.Res.Dust+Config.DustStormAdd)
		s.DustHold = Config.DustStormHoldSols
	}

	s.Messages = m.buildMessages(sol)

	if id, ok := s.CardSols[sol]; ok {
		onCardDrawn(id, &s.Res)
		c := Cards[id]
		s.PendingCard = &c
	} else {
		s.PendingCard = nil
	}
	m.cardLines = nil
	m.updateBlocks()
}

func (m *Mission) buildMessages(sol int) []Message {
	s := &m.State
	delay := func() int { return m.rng.Int(Config.CommDelayMin, Config.CommDelayMax) }
	var msgs []Message
	for _, storm := range s.Storms {
		f := storm.Flare
		if storm.Sol == sol+1 {
			msgs = append(msgs, Message{Kind: "stormAlert", Flare: &f, DelayMin: storm.DelayMin, ImpactSol: storm.Sol})
		}
		if storm.Sol == sol {
			msgs = append(msgs, Message{Kind: "stormToday", Flare: &f, DelayMin: storm.DelayMin})
		}
	}
	if s.DustStormSol == sol+1 {
		msgs = append(msgs, Message{Kind: "dustAlert", DelayMin: delay(), Sol: s.DustStormSol})
	}
	if s.DustStormSol == sol {
		msgs = append(msgs, Message{Kind: "dustNow"})
	}
	if len(msgs) == 0 {
		msgs = append(msgs, Message{Kind: "allClear", DelayMin: delay()})
	}
	return msgs
}

func (m *Mission) updateBlocks() {
	b := jsRound(mul(float64(Config.PanelBlocks), 1-m.State.Res.Dust/100))
	m.State.Blocks = int(math.Max(float64(Config.MinBlocks), b))
}

func (m *Mission) AnswerCard(optionID string) ([]ReportLine, error) {
	card := m.State.PendingCard
	if card == nil {
		return nil, ErrNoPendingCard
	}
	if !slices.ContainsFunc(card.Options, func(o CardOption) bool { return o.ID == optionID }) {
		return nil, fmt.Errorf("%w: %s", ErrInvalidOption, optionID)
	}
	lines := applyCardOption(card.ID, optionID, &m.State.Res, m.rng)
	m.cardLines = append(m.cardLines, lines...)
	m.State.PendingCard = nil
	m.updateBlocks()
	m.checkLoss()
	return lines, nil
}

func (m *Mission) IsPlanValid(p EnergyPlan) bool {
	if p.Life < 0 || p.Shield < 0 || p.Science < 0 {
		return false
	}
	return p.Life+p.Shield+p.Science <= m.State.Blocks
}

// EndSol executa o dia e a noite com o plano de energia e avança para o próximo sol.
func (m *Mission) EndSol(plan EnergyPlan) (SolReport, error) {
	s := &m.State
	if s.Outcome.Status != "playing" {
		return SolReport{}, ErrMissionOver
	}
	if s.PendingCard != nil {
		return SolReport{}, ErrCardPending
	}
	if !m.IsPlanValid(plan) {
		return SolReport{}, ErrInvalidPlan
	}

	r := &s.Res
	before := *r
	lines := append([]ReportLine(nil), m.cardLines...)
	storm := m.StormToday()
	leftover := s.Blocks - plan.Life - plan.Shield - plan.Science

	// Suporte de vida: 3 blocos = estável; cada bloco a mais ou a menos muda 6.
	lifeDelta := mul(float64(plan.Life-Config.LifeStableBlks), Config.LifePerBlock)
	r.Life = clamp(r.Life+lifeDelta, 0, Config.LifeMax)
	key, tone := "report.life.stable", "neutral"
	if lifeDelta > 0 {
		key, tone = "report.life.up", "good"
	} else if lifeDelta < 0 {
		key, tone = "report.life.down", "bad"
	}
	lines = append(lines, ReportLine{Key: key, Params: map[string]any{"blocks": plan.Life, "delta": math.Abs(lifeDelta)}, Tone: tone})

	// Blindagem: desgaste diário, reforço por bloco.
	shieldDelta := mul(float64(plan.Shield), Config.ShieldPerBlock) - Config.ShieldDecay
	r.Shield = clamp(r.Shield+shieldDelta, 0, Config.ShieldMax)
	tone = "good"
	if shieldDelta < 0 {
		tone = "bad"
	}
	lines = append(lines, ReportLine{Key: "report.shield", Params: map[string]any{"blocks": plan.Shield, "value": jsRound(r.Shield)}, Tone: tone})

	// Ciência: metade no sol de tempestade.
	factor := 1.0
	if storm != nil {
		factor = Config.ScienceStormFactor
	}
	sciGain := mul(mul(float64(plan.Science), Config.SciencePerBlock), factor)
	r.Science += sciGain
	if plan.Science > 0 {
		k := "report.science"
		if storm != nil {
			k = "report.science.storm"
		}
		lines = append(lines, ReportLine{Key: k, Params: map[string]any{"blocks": plan.Science, "gain": sciGain}, Tone: "good"})
	}

	// Bateria: guarda o que sobrou, a noite cobra.
	r.Battery = math.Min(Config.BatteryMax, r.Battery+mul(float64(leftover), Config.BatteryPerLeftoverBlock))
	if leftover > 0 {
		lines = append(lines, ReportLine{Key: "report.battery.saved", Params: map[string]any{"blocks": leftover, "gain": mul(float64(leftover), Config.BatteryPerLeftoverBlock)}})
	}
	r.Battery -= Config.BatteryNightCost
	if r.Battery < 0 {
		missing := -r.Battery
		lifeLost := round1(mul(missing, Config.BatteryLifePerMissingPoint))
		r.Life = clamp(r.Life-lifeLost, 0, Config.LifeMax)
		r.Battery = 0
		lines = append(lines, ReportLine{Key: "report.night.short", Params: map[string]any{"missing": missing, "lifeLost": lifeLost}, Tone: "bad"})
	} else {
		lines = append(lines, ReportLine{Key: "report.night.ok", Params: map[string]any{"cost": Config.BatteryNightCost}})
	}

	// Tempestade solar: dose depende da blindagem.
	var stormResult *StormResult
	if storm != nil {
		dose := StormDose(storm.Flare.Cls, r.Shield)
		r.Dose += dose
		stormResult = &StormResult{Flare: storm.Flare, Dose: dose}
		lines = append(lines, ReportLine{Key: "report.storm", Params: map[string]any{"label": storm.Flare.Label, "dose": dose, "shield": jsRound(r.Shield)}, Tone: "bad"})
	}
	r.Dose += Config.DosePerSol

	// Poeira: vento limpa, exceto durante a tempestade de poeira.
	if s.DustHold > 0 {
		s.DustHold--
		if r.Dust > 0 {
			lines = append(lines, ReportLine{Key: "report.dust.hold", Params: map[string]any{"dust": jsRound(r.Dust)}, Tone: "bad"})
		}
	} else if r.Dust > 0 {
		r.Dust = math.Max(0, r.Dust-Config.DustWindCleanPerSol)
		lines = append(lines, ReportLine{Key: "report.dust.wind", Params: map[string]any{"dust": jsRound(r.Dust)}})
	}

	r.Life = round1(r.Life)
	r.Dose = round1(r.Dose)

	report := SolReport{Sol: s.Sol, Plan: plan, Before: before, After: *r, Storm: stormResult, Lines: lines}
	s.Reports = append(s.Reports, report)

	m.checkLoss()
	if s.Outcome.Status == "playing" {
		if s.Sol >= Config.Sols {
			s.Outcome = Outcome{Status: "won", Stars: m.stars()}
		} else {
			m.startSol(s.Sol + 1)
		}
	}
	return report, nil
}

func (m *Mission) checkLoss() {
	s := &m.State
	if s.Outcome.Status != "playing" {
		return
	}
	if s.Res.Life <= 0 {
		s.Outcome = Outcome{Status: "lost", Reason: "life", Sol: s.Sol}
	} else if s.Res.Dose >= Config.DoseMax {
		s.Outcome = Outcome{Status: "lost", Reason: "dose", Sol: s.Sol}
	}
}

func (m *Mission) stars() int {
	r := m.State.Res
	if r.Science < Config.ScienceGoal {
		return 1
	}
	if r.Dose >= Config.StarsDoseFor3 {
		return 2
	}
	return 3
}

// StormDose: max(1, round(intensidade × (1 − blindagem/100 × 0,85))). Escala do jogo (INTERPRETADO).
func StormDose(cls FlareClass, shield float64) float64 {
	return math.Max(1, jsRound(mul(Config.StormIntensity[cls], 1-mul(shield/100, Config.DoseShieldFactor))))
}

func rangeInts(a, b int) []int {
	out := make([]int, 0, b-a+1)
	for i := a; i <= b; i++ {
		out = append(out, i)
	}
	return out
}
