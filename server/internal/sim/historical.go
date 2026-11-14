package sim

import (
	"encoding/json"
	"math"
	"slices"
)

// Missões históricas: espelha src/sim/historical.ts.

// MissionsFile é o formato de public/data/missions.json (scripts/fetch-missions.mjs).
type MissionsFile struct {
	SchemaVersion int `json:"schemaVersion"`
	Missions      []struct {
		ID         int    `json:"id"`
		Difficulty string `json:"difficulty"`
		StartUtc   string `json:"startUtc"`
		EndUtc     string `json:"endUtc"`
		Storms     []struct {
			Sol       json.Number    `json:"sol"`
			StartTime string         `json:"startTime"`
			CmeType   string         `json:"cmeType"`
			SpeedKmS  NullableNumber `json:"speedKmS"`
			Strength  string         `json:"strength"`
			Link      *string        `json:"link"`
		} `json:"storms"`
		Sols []missionSol `json:"sols"`
	} `json:"missions"`
}

type missionSol struct {
	Sol               int     `json:"sol"`
	EarthDelayMinutes float64 `json:"earthDelayMinutes"`
}

// ParseMissions converte o arquivo; descarta missão incompleta em vez de quebrar.
func ParseMissions(raw []byte) []HistoricalMission {
	var data MissionsFile
	if json.Unmarshal(raw, &data) != nil || data.SchemaVersion != 1 {
		return nil
	}
	var out []HistoricalMission
	for _, m := range data.Missions {
		sols := slices.Clone(m.Sols)
		slices.SortStableFunc(sols, func(a, b missionSol) int { return a.Sol - b.Sol })
		delays := make([]float64, 0, len(sols))
		for _, s := range sols {
			delays = append(delays, s.EarthDelayMinutes)
		}
		h := HistoricalMission{ID: m.ID, Difficulty: m.Difficulty, StartUtc: m.StartUtc, EndUtc: m.EndUtc, Delays: delays}
		for _, s := range m.Storms {
			cls, ok := Config.StrengthClass[s.Strength]
			sol, err := s.Sol.Int64()
			if !ok || err != nil {
				continue
			}
			// speedKmS: ausente no arquivo = ausente; null = null; número = número (igual ao TS).
			f := Flare{Cls: cls, Label: s.CmeType, Real: true, Time: s.StartTime, Source: "cme", SpeedKmS: s.SpeedKmS}
			if s.Link != nil {
				f.Link = *s.Link
			}
			h.Storms = append(h.Storms, struct {
				Sol   int   `json:"sol"`
				Flare Flare `json:"flare"`
			}{Sol: int(sol), Flare: f})
		}
		ok := (m.Difficulty == "medium" || m.Difficulty == "hard") &&
			len(delays) == Config.Sols &&
			!slices.ContainsFunc(delays, func(d float64) bool { return !(d > 0) }) &&
			len(h.Storms) == Config.StormCount
		if ok {
			out = append(out, h)
		}
	}
	return out
}

// PickHistorical: primeira partida só com missões de força média; depois, qualquer uma.
func PickHistorical(missions []HistoricalMission, seed uint32, firstGame bool) *HistoricalMission {
	pool := missions
	if firstGame {
		pool = slices.DeleteFunc(slices.Clone(missions), func(m HistoricalMission) bool { return m.Difficulty != "medium" })
	}
	if len(pool) == 0 {
		pool = missions
	}
	if len(pool) == 0 {
		return nil
	}
	// createRng(seed ^ 0x9e3779b9).pick(list): items[floor(next() * length)]
	r := NewRng(seed ^ 0x9e3779b9)
	h := pool[int(math.Floor(mul(r.Next(), float64(len(pool)))))]
	return &h
}
