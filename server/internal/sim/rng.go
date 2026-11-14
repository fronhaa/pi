package sim

import "math"

// Rng é o mulberry32 (mesmo de src/sim/rng.ts). Usado pelo modo coop para sorteios que não
// são regra do jogo (ex.: atraso da mensagem que um jogador da Terra manda).
type Rng struct{ a uint32 }

func NewRng(seed uint32) *Rng { return &Rng{a: seed} }

func (r *Rng) Next() float64 {
	r.a += 0x6d2b79f5
	t := r.a
	t = (t ^ (t >> 15)) * (t | 1)
	t ^= t + (t^(t>>7))*(t|61)
	return float64(t^(t>>14)) / 4294967296
}

// Int devolve um inteiro em [min, max].
func (r *Rng) Int(min, max int) int {
	return min + int(math.Floor(r.Next()*float64(max-min+1)))
}
