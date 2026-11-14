import type { ClientAction, CoopState, CrewPos, ServerMsg } from './protocol';

/**
 * Endereço do servidor coop, nesta ordem:
 *   1. ?coop=wss://… na URL (útil com link temporário);
 *   2. VITE_COOP_URL no build: um wss://… fixo, ou "same-origin" quando o próprio servidor
 *      coop serve o jogo (imagem Docker): conecta em /ws do mesmo endereço da página.
 */
export function coopServerUrl(): string | null {
  try {
    const fromQuery = new URLSearchParams(location.search).get('coop');
    if (fromQuery && /^wss?:\/\//.test(fromQuery)) return fromQuery.endsWith('/ws') ? fromQuery : `${fromQuery.replace(/\/$/, '')}/ws`;
  } catch {
    /* sem location (testes) */
  }
  const fromEnv = import.meta.env.VITE_COOP_URL as string | undefined;
  if (fromEnv === 'same-origin') return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return fromEnv && /^wss?:\/\//.test(fromEnv) ? fromEnv : null;
}

const SESSION_KEY = 'jezero.coop';
const MAX_RETRIES = 10;

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * Conexão com o servidor coop. Se a internet cair, reconecta sozinho com o token
 * (o jogador volta para a mesma sala e o mesmo papel). Nada de dado pessoal é enviado.
 */
export class CoopClient {
  onState: (s: CoopState) => void = () => {};
  onError: (code: string) => void = () => {};
  onStatus: (s: ConnStatus) => void = () => {};
  /** Posição dos astronautas dos outros jogadores (só visual). */
  onCrew: (list: CrewPos[]) => void = () => {};

  private ws: WebSocket | null = null;
  private session: { code: string; token: string } | null = null;
  private retries = 0;
  private leaving = false;

  constructor(private readonly url: string) {}

  /** Volta à sala desta aba, se houver (recarregou a página). */
  savedSession(): { code: string; token: string } | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as { code: string; token: string }) : null;
    } catch {
      return null;
    }
  }

  create(): void {
    this.open({ t: 'create' });
  }

  join(code: string): void {
    this.open({ t: 'join', code: code.trim().toUpperCase() });
  }

  rejoin(session: { code: string; token: string }): void {
    this.session = session;
    this.open({ t: 'rejoin', ...session });
  }

  send(a: ClientAction): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(a));
  }

  leave(): void {
    this.leaving = true;
    this.session = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignora */
    }
    this.ws?.close();
    this.onStatus('closed');
  }

  private open(first: ClientAction): void {
    this.leaving = false;
    this.ws?.close();
    this.onStatus(this.retries > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.onStatus('open');
      ws.send(JSON.stringify(first));
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        this.session = { code: msg.code, token: msg.token };
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
        } catch {
          /* sem sessionStorage: só não volta sozinho ao recarregar */
        }
      } else if (msg.t === 'state') {
        this.onState(msg);
      } else if (msg.t === 'crew') {
        this.onCrew(msg.list);
      } else if (msg.t === 'error') {
        if (msg.code === 'bad_token' || (msg.code === 'room_not_found' && first.t === 'rejoin')) this.leave();
        this.onError(msg.code);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.leaving) return;
      if (this.session && this.retries < MAX_RETRIES) {
        this.retries++;
        this.onStatus('reconnecting');
        const session = this.session;
        window.setTimeout(() => this.open({ t: 'rejoin', ...session }), Math.min(1000 * this.retries, 5000));
      } else {
        this.onStatus('closed');
      }
    };
  }
}
