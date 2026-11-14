package sim

import "math"

// Rng é o mulberry32 de src/sim/rng.ts. Mesma semente = mesma sequência, bit a bit.
// As operações do JS (>>> 0, Math.imul, soma convertida para int32) equivalem à
// aritmética de uint32 com estouro, que é o que o Go faz naturalmente.
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
	return min + int(math.Floor(mul(r.Next(), float64(max-min+1))))
}

func (r *Rng) Chance(p float64) bool { return r.Next() < p }

// Shuffle devolve uma cópia embaralhada (Fisher-Yates, mesma ordem de sorteios do TS).
func Shuffle[T any](r *Rng, items []T) []T {
	out := append([]T(nil), items...)
	for i := len(out) - 1; i > 0; i-- {
		j := int(math.Floor(mul(r.Next(), float64(i+1))))
		out[i], out[j] = out[j], out[i]
	}
	return out
}

// jsRound reproduz Math.round do JavaScript: .5 arredonda para +∞ (math.Round arredonda para longe do zero).
func jsRound(x float64) float64 {
	r := math.Floor(x)
	if x-r >= 0.5 {
		r++
	}
	return r
}

func round1(n float64) float64 { return jsRound(mul(n, 10)) / 10 }

// mul multiplica e ARREDONDA o resultado para float64 antes de qualquer soma.
// Sem isso, o compilador Go pode fundir a*b+c numa instrução FMA (arm64 faz isso),
// sem o arredondamento intermediário que o JavaScript sempre faz, e 9,5 vira 9,4999…
// A especificação do Go garante: uma conversão explícita float64(...) impede a fusão.
// REGRA: toda multiplicação de float nesta pasta passa por mul().
func mul(a, b float64) float64 { return float64(a * b) }

func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }
