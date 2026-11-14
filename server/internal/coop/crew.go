package coop

import (
	"encoding/json"
	"math"
	"slices"
)

// Posição da tripulação no modo em grupo (docs/servidor-coop.md, "Tripulação").
//
// Cada jogador de Marte controla só o astronauta do(s) seu(s) papel(is). A cena dele manda,
// algumas vezes por segundo, onde cada astronauta está e para onde vai; o servidor confere
// o dono e repassa aos outros jogadores, que fazem o astronauta andar até lá na tela deles.
// É só visual: as REGRAS não dependem da posição (o conserto dos problemas já vem por
// problem_progress/problem_resolve). Por isso o servidor não guarda nada além da última posição.

// CrewPos é a posição de um astronauta no plano XZ (metros). Tx/Tz = destino, se estiver andando.
// Place: onde ele está ("inside", "airlock" ou "outside"; vazio = "outside", compatível com antes).
type CrewPos struct {
	Role  Role     `json:"role"`
	X     float64  `json:"x"`
	Z     float64  `json:"z"`
	Tx    *float64 `json:"tx,omitempty"`
	Tz    *float64 `json:"tz,omitempty"`
	Place string   `json:"place,omitempty"`
}

// CrewBounds: a tripulação não sai a mais disso do centro da base (mesmo limite da cena).
const CrewBounds = 40

type crewMsg struct {
	T    string    `json:"t"` // "crew"
	List []CrewPos `json:"list"`
}

func validPos(p CrewPos) bool {
	ok := func(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) && math.Abs(v) <= CrewBounds }
	if !ok(p.X) || !ok(p.Z) {
		return false
	}
	if (p.Tx == nil) != (p.Tz == nil) {
		return false
	}
	if p.Place != "" && p.Place != "inside" && p.Place != "airlock" && p.Place != "outside" {
		return false
	}
	return p.Tx == nil || (ok(*p.Tx) && ok(*p.Tz))
}

// crewLocked confere e repassa as posições. Não muda a partida, então não manda "state".
func (r *Room) crewLocked(pid string, list []CrewPos) error {
	// Os astronautas andam em qualquer fase da partida (inclusive na vez da Terra), menos no fim.
	if r.game == nil || r.game.Phase == PhaseEnded {
		return ErrWrongPhase
	}
	if len(list) == 0 || len(list) > len(MarsRoles) {
		return ErrInvalidInput
	}
	for _, p := range list {
		if !slices.Contains(MarsRoles, p.Role) || !validPos(p) {
			return ErrInvalidInput
		}
		if !r.controls(pid, p.Role) { // dono do papel, ou quem comanda a EVA dele
			return ErrNotYourRole
		}
	}
	if r.crew == nil {
		r.crew = map[Role]CrewPos{}
	}
	for _, p := range list {
		last := p
		last.Tx, last.Tz = nil, nil
		r.crew[p.Role] = last
	}
	b, err := json.Marshal(crewMsg{T: "crew", List: list})
	if err != nil {
		return err
	}
	for _, other := range r.players {
		if other.ID != pid && other.send != nil {
			other.send(b)
		}
	}
	return nil
}
