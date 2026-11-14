package sim

import "sort"

// Problemas pela base: espelha src/sim/problems.ts.
type ProblemDef struct {
	Kind        ProblemKind
	TaskSeconds float64
	Outside     bool // fora da base: câmara de descompressão e dose ao terminar
}

var Problems = map[ProblemKind]ProblemDef{
	"dustyPanels":    {"dustyPanels", 15, true},
	"greenhouseLeak": {"greenhouseLeak", 10, false},
	"antenna":        {"antenna", 15, true},
	"roverStuck":     {"roverStuck", 20, true},
	"tornBag":        {"tornBag", 10, true},
}

// ProblemKinds na MESMA ordem de Object.keys(PROBLEMS) no TS (o embaralhamento depende dela).
var ProblemKinds = []ProblemKind{"dustyPanels", "greenhouseLeak", "antenna", "roverStuck", "tornBag"}

// scheduleProblems sorteia os problemas do dia: a partir do sol 3, 1 ou 2, tipos diferentes.
func scheduleProblems(sol int, rng *Rng, nextUID func() int) []Problem {
	if sol < Config.ProblemsFirstSol {
		return nil
	}
	count := rng.Int(Config.ProblemsMinPerDay, Config.ProblemsMaxPerDay)
	kinds := Shuffle(rng, ProblemKinds)[:count]
	out := make([]Problem, 0, count)
	for _, k := range kinds {
		uid := nextUID()
		out = append(out, Problem{UID: uid, Kind: k, SpawnAt: rng.Int(Config.ProblemsSpawnMin, Config.ProblemsSpawnMax), Status: "pending"})
	}
	// Array.prototype.sort do JS é estável: SliceStable mantém a mesma ordem nos empates.
	sort.SliceStable(out, func(i, j int) bool { return out[i].SpawnAt < out[j].SpawnAt })
	return out
}
