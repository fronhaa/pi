package coop

import (
	"errors"
	"slices"
)

// EVA no modo em grupo (docs/servidor-coop.md, "EVA no modo em grupo").
//
// Regra do jogo (src/core/CrewTasks.ts, GDD "EVA: sair da base"): problema de fora exige uma
// dupla, e só UMA dupla pode estar fora ao mesmo tempo. No grupo, cada tela só via a própria
// dupla; por isso a EVA vira estado da SALA:
//   - quem inicia ("eva") precisa ser dono do líder; o parceiro pode ser de outro jogador
//     (parceiro automático, decisão do time em 14/11/2026);
//   - até a dupla voltar ("eva_end"), quem iniciou COMANDA os dois: só ele manda a posição
//     deles (crew_pos), e o dono do parceiro vê "em EVA com o Jogador N";
//   - a EVA acaba sozinha quando o dia termina (noite, fim da partida).

var (
	errEvaBusy   = errors.New("eva_busy")   // já tem uma dupla lá fora
	errEvaBanned = errors.New("eva_banned") // tempestade avisada: ninguém sai hoje
)

// EvaView: dupla lá fora e quem a comanda (ID do jogador).
type EvaView struct {
	Pair [2]Role `json:"pair"`
	By   string  `json:"by"`
}

func (r *Room) startEva(pid string, pair []Role) error {
	if r.game == nil || r.game.Phase != PhaseDay {
		return ErrWrongPhase
	}
	if len(pair) != 2 || pair[0] == pair[1] || !slices.Contains(MarsRoles, pair[0]) || !slices.Contains(MarsRoles, pair[1]) {
		return ErrInvalidInput
	}
	if r.owners[pair[0]] != pid {
		return ErrNotYourRole
	}
	if r.eva != nil {
		return errEvaBusy
	}
	if r.game.Mission.EvaBanned() {
		return errEvaBanned
	}
	r.eva = &EvaView{Pair: [2]Role{pair[0], pair[1]}, By: pid}
	return nil
}

func (r *Room) endEva(pid string) error {
	if r.eva == nil {
		return nil
	}
	if r.eva.By != pid {
		return ErrNotYourRole
	}
	r.eva = nil
	return nil
}

// controls: este jogador pode mandar a posição deste astronauta agora?
// Na EVA, só quem a comanda; fora dela, o dono do papel.
func (r *Room) controls(pid string, role Role) bool {
	if r.eva != nil && slices.Contains(r.eva.Pair[:], role) {
		return r.eva.By == pid
	}
	return r.owners[role] == pid
}
