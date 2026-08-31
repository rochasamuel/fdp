import { useCallback } from "react";
import { useUi } from "../store/ui";

export type SoundName = "draw" | "play" | "turn" | "victory" | "bubble";

/** Solte um mp3 com o nome do efeito em `public/sounds/` e ele passa a tocar. */
const cache = new Map<SoundName, HTMLAudioElement>();

/** O volume de um efeito da mesa. Metade: o jogo é a conversa, não o mp3. */
export const VOLUME = 0.5;

function get(name: SoundName) {
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(`/sounds/${name}.mp3`);
    cache.set(name, audio);
  }
  return audio;
}

/**
 * Toca um efeito, de qualquer lugar — inclusive de fora do React.
 *
 * A chave do som mora no store, e o store se lê sem hook nenhum. Isto é o que
 * deixa o reparto, que é escalonado por relógio em `flights.ts` e não por
 * render, soar sem arrastar um componente junto.
 */
export function playSound(name: SoundName, volume = VOLUME) {
  if (!useUi.getState().soundEnabled) return;
  const audio = get(name);
  // Sempre atribuído, e não só quando difere do padrão: o elemento é um só por
  // efeito, então quem toca mais baixo deixaria a próxima carta baixa também.
  audio.volume = volume;
  audio.currentTime = 0;
  // Missing file, or a browser that has not seen a gesture yet: not worth reporting.
  void audio.play().catch(() => {});
}

export function useSound() {
  // A assinatura é o que faz a mesa redesenhar ao ligar e desligar o som; quem
  // decide de fato é o `playSound`, que lê o valor na hora de tocar.
  const enabled = useUi((state) => state.soundEnabled);
  return useCallback(
    (name: SoundName, volume?: number) => void (enabled && playSound(name, volume)),
    [enabled],
  );
}
