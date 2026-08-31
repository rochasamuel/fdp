import { create } from "zustand";
import { prefersReducedMotion, watchReducedMotion } from "../lib/motion";
import { backUrl, type Back } from "../lib/cards";
import { applyFelt, type Felt } from "../lib/felt";
import { loadPlayerName, loadPrefs, savePrefs, type SeatLayout } from "../lib/session";

const prefs = loadPrefs();

/** Client-side only. The game state lives on the server and arrives through Colyseus. */
type UiStore = {
  playerName: string;
  soundEnabled: boolean;
  /** Como os assentos se arrumam: a fileira de sempre ou a mesa redonda. */
  seatLayout: SeatLayout;
  /** A chave da mesa; a do sistema entra por `isLowMotion`. */
  lowMotion: boolean;
  /** O pano da mesa. De quem olha, não da sala: ver `lib/felt.ts`. */
  felt: Felt;
  /** O verso do baralho, pelo mesmo motivo do pano: ver `lib/cards.ts`. */
  back: Back;
  setPlayerName: (name: string) => void;
  toggleSound: () => void;
  setSeatLayout: (layout: SeatLayout) => void;
  setLowMotion: (low: boolean) => void;
  setFelt: (felt: Felt) => void;
  setBack: (back: Back) => void;
};

export const useUi = create<UiStore>((set, get) => ({
  playerName: loadPlayerName(),
  soundEnabled: true,
  seatLayout: prefs.seatLayout,
  lowMotion: prefs.lowMotion,
  felt: prefs.felt,
  back: prefs.back,
  setPlayerName: (playerName) => set({ playerName }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  setSeatLayout: (seatLayout) => {
    set({ seatLayout });
    persist(get());
  },
  setLowMotion: (lowMotion) => {
    set({ lowMotion });
    persist(get());
  },
  setFelt: (felt) => {
    set({ felt });
    applyFelt(felt);
    persist(get());
  },
  setBack: (back) => {
    set({ back });
    persist(get());
  },
}));

/**
 * O que do store sobrevive ao fechar a aba. Escolhido campo a campo, e não por
 * espalhamento: o store também carrega o nome de quem joga e as próprias
 * funções, e nada disso é preferência de mesa.
 */
const persist = ({ seatLayout, lowMotion, felt, back }: UiStore) =>
  savePrefs({ seatLayout, lowMotion, felt, back });

/**
 * A resposta que o resto do código quer: a mesa se move ou não?
 *
 * Fora do React de propósito — quem mais pergunta é o `flights.ts`, que decide
 * no meio de uma jogada se a carta voa, e não durante um render.
 */
export const isLowMotion = () => useUi.getState().lowMotion || prefersReducedMotion();

/**
 * O verso em uso, pronto para virar `src`.
 *
 * Fora do React pelo mesmo motivo do `isLowMotion`: quem pergunta é o
 * `flights.ts`, que escolhe a arte da carta no instante em que ela decola, e
 * não durante um render. Dentro de um componente, leia `ui.back` do store e
 * chame o `backUrl` — assim a troca de verso repinta a tela.
 */
export const currentBackUrl = () => backUrl(useUi.getState().back);

/**
 * Uma classe no <html> e o CSS inteiro segue. É por aqui que a chave da mesa
 * alcança as animações que moram na folha de estilo: elas ficam sob
 * `.motion-off`, e não sob a media query, porque a media query só ouve o
 * sistema. Ver "movimento reduzido" no index.css.
 */
/**
 * O pano guardado, antes do primeiro render. É um atributo no <html> e não uma
 * classe porque são cinco valores e não um liga-desliga: ver `--felt` no
 * index.css.
 */
export function syncFelt() {
  applyFelt(useUi.getState().felt);
}

export function syncMotionClass() {
  const apply = () => document.documentElement.classList.toggle("motion-off", isLowMotion());
  apply();
  useUi.subscribe(apply);
  watchReducedMotion(apply);
}
