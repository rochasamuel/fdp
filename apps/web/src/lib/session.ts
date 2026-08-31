/**
 * Just enough in localStorage to get back into a room after a refresh — e para
 * a próxima mesa nascer parecida com a última. O estado do jogo nunca entra
 * aqui: ele é do servidor.
 */

import {
  DEFAULT_HOUSE_RULES,
  DEFAULT_MAX_PLAYERS,
  MAX_CARDS_CAP,
  MAX_PLAYERS,
  MAX_STARTING_POINTS,
  MIN_PLAYERS,
  MIN_STARTING_POINTS,
  STARTING_POINTS,
} from "@fdp/shared";
import { DEFAULT_BACK, isBack, type Back } from "./cards";
import { DEFAULT_FELT, isFelt, type Felt } from "./felt";

export type StoredSession = {
  reconnectionToken: string;
  playerName: string;
  /**
   * A chave da cadeira nesta mesa. Ao contrário do `reconnectionToken`, que o
   * servidor troca a cada reconexão, esta não muda nunca — é ela que devolve o
   * lugar a quem voltou com o token velho na mão. Ver `seatKey` no
   * `@fdp/shared`.
   */
  seatKey: string;
};

/**
 * Como a última mesa foi aberta. Quem joga toda semana abre a mesa toda semana
 * do mesmo jeito, e redigitar o mesmo nome todas as vezes é trabalho que o
 * navegador pode fazer.
 */
export type StoredSetup = {
  roomName: string;
  maxPlayers: number;
  /** O teto de cartas por rodada; `0` é sem teto. Ver `maxHandSize`. */
  maxCards: number;
  /** Com quantos pontos todo mundo senta. Ver `STARTING_POINTS`. */
  startingPoints: number;
  /** As regras da casa da última mesa. Ver `HouseRules` no `@fdp/shared`. */
  cangar: boolean;
  porcao: boolean;
};

const sessionKey = (code: string) => `fdp:session:${code}`;
const NAME_KEY = "fdp:name";
const SETUP_KEY = "fdp:setup";
const PREFS_KEY = "fdp:prefs";

export function loadSession(code: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(code));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: StoredSession) {
  localStorage.setItem(sessionKey(code), JSON.stringify(session));
  localStorage.setItem(NAME_KEY, session.playerName);
}

export function clearSession(code: string) {
  localStorage.removeItem(sessionKey(code));
}

export const loadPlayerName = () => localStorage.getItem(NAME_KEY) ?? "";

/**
 * A chave desta mesa: a que já existe, ou uma nova.
 *
 * Sorteada, e nunca derivada do nome: é uma credencial ao portador, e um nome
 * seria adivinhável — bastaria digitar "Ana" para sentar na cadeira da Ana
 * enquanto ela estivesse caída.
 */
export function seatKeyFor(code: string): string {
  const saved = loadSession(code)?.seatKey;
  return saved || newSeatKey();
}

export const newSeatKey = () =>
  typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : // Navegador sem `randomUUID` (http em rede local, por exemplo): duas
      // rodadas de base 36 dão entropia de sobra para uma mesa de dez pessoas.
      `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

export function saveSetup(setup: StoredSetup) {
  localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
}

/**
 * O que ficou guardado, campo a campo e sempre válido. O que está no
 * localStorage é de uma versão anterior do jogo ou do que alguém digitou lá:
 * um número de lugares fora da faixa, um nome vazio. Cada campo que não passa
 * vira o padrão, em vez de a tela inteira desistir.
 */
export function loadSetup(): StoredSetup {
  const fallback: StoredSetup = {
    roomName: "Sexta-feira FDP",
    maxPlayers: DEFAULT_MAX_PLAYERS,
    maxCards: 0,
    startingPoints: STARTING_POINTS,
    ...DEFAULT_HOUSE_RULES,
  };

  let stored: Partial<StoredSetup>;
  try {
    stored = JSON.parse(localStorage.getItem(SETUP_KEY) ?? "") as Partial<StoredSetup>;
  } catch {
    return fallback;
  }
  if (!stored || typeof stored !== "object") return fallback;

  const seats = Number(stored.maxPlayers);
  const cards = Number(stored.maxCards);
  const points = Number(stored.startingPoints);
  return {
    roomName:
      typeof stored.roomName === "string" && stored.roomName.trim()
        ? stored.roomName
        : fallback.roomName,
    maxPlayers:
      seats >= MIN_PLAYERS && seats <= MAX_PLAYERS ? Math.round(seats) : fallback.maxPlayers,
    maxCards: cards >= 1 && cards <= MAX_CARDS_CAP ? Math.round(cards) : 0,
    startingPoints:
      points >= MIN_STARTING_POINTS && points <= MAX_STARTING_POINTS
        ? Math.round(points)
        : fallback.startingPoints,
    cangar: stored.cangar === true,
    porcao: stored.porcao === true,
  };
}

/**
 * O que a pessoa ajustou na mesa — não o combinado da partida, que é do
 * servidor, mas como ela quer VER a mesa. Fica aqui pelo mesmo motivo que o
 * nome: quem desliga o movimento uma vez não quer religá-lo toda sexta.
 */
export type SeatLayout = "row" | "ring";
export type StoredPrefs = {
  seatLayout: SeatLayout;
  lowMotion: boolean;
  /** O pano da mesa. É de quem olha, e não da sala: ver `felt.ts`. */
  felt: Felt;
  /** O verso do baralho, pelo mesmo motivo do pano: ver `cards.ts`. */
  back: Back;
  /**
   * Pedir um segundo toque antes de a carta sair da mão. Vale só onde o dedo
   * escorrega — ver `confirmPlay` na `store/ui.ts`.
   */
  confirmPlay: boolean;
};

export function savePrefs(prefs: StoredPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/** Campo a campo e sempre válido, como o `loadSetup` logo acima. */
export function loadPrefs(): StoredPrefs {
  const fallback: StoredPrefs = {
    seatLayout: "row",
    lowMotion: false,
    felt: DEFAULT_FELT,
    back: DEFAULT_BACK,
    // Ligada de saída: quem joga no celular ganha a proteção sem precisar
    // descobrir a chave, e a desliga se for atrapalho.
    confirmPlay: true,
  };

  let stored: Partial<StoredPrefs>;
  try {
    stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "") as Partial<StoredPrefs>;
  } catch {
    return fallback;
  }
  if (!stored || typeof stored !== "object") return fallback;

  return {
    seatLayout: stored.seatLayout === "ring" ? "ring" : "row",
    lowMotion: stored.lowMotion === true,
    felt: isFelt(stored.felt) ? stored.felt : fallback.felt,
    back: isBack(stored.back) ? stored.back : fallback.back,
    // A única que não é `=== true`: o padrão dela é ligado, então quem nunca
    // mexeu — e quem guardou os ajustes antes desta chave existir — a recebe
    // ligada.
    confirmPlay: stored.confirmPlay !== false,
  };
}
