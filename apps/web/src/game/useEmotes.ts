import { useEffect, useRef, useState } from "react";
import { EMOTE_LINGER, type Emote } from "@fdp/shared";
import { useSound } from "../lib/sound";
import type { RoomConnection } from "./useRoomConnection";

/**
 * O que um jogador está dizendo agora. `seq` sobe a cada emoji e serve de chave
 * na tela: mandar o mesmo duas vezes não muda o desenho, e sem trocar a chave o
 * balão ficaria parado — a repetição, que é justamente ênfase, passaria muda.
 */
export type Bubble = { emote: Emote; seq: number };

/**
 * A conversa da mesa, um balão por jogador.
 *
 * Um por jogador, e não uma fila: quem manda um emoji novo antes de o anterior
 * sumir está corrigindo o que disse, não escrevendo a segunda linha de um
 * parágrafo. O balão novo toma o lugar do velho e reinicia o relógio.
 *
 * Os balões vivem aqui, e não no estado sincronizado, porque somem sozinhos —
 * o servidor só anuncia o instante em que alguém falou; quanto tempo aquilo
 * fica na tela é assunto de cada tela. O parâmetro é opcional pela mesa de
 * mentira do /mock, que não tem sala atrás dela.
 */
export function useEmotes(onEmote?: RoomConnection["onEmote"]) {
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const play = useSound();

  useEffect(() => {
    if (!onEmote) return;
    const pending = timers.current;

    const unsubscribe = onEmote(({ by, emote }) => {
      /*
       * O som é de quem OUVE, e não de quem fala: toca em toda fala anunciada,
       * inclusive na sua. Ele é o que faz o balão funcionar de verdade — na
       * partida os olhos estão no leque e na pilha, e sem barulho a fala dos
       * outros passaria despercebida no canto da tela.
       *
       * Não toca no clique, como o tapa: uma fala rápida demais é engolida pelo
       * intervalo do servidor, e o som adiantado anunciaria um balão que nunca
       * apareceria em mesa nenhuma.
       */
      play("bubble");
      clearTimeout(pending.get(by));
      pending.set(
        by,
        setTimeout(() => {
          pending.delete(by);
          setBubbles(({ [by]: _gone, ...rest }) => rest);
        }, EMOTE_LINGER),
      );
      setBubbles((current) => ({
        ...current,
        [by]: { emote, seq: (current[by]?.seq ?? 0) + 1 },
      }));
    });

    return () => {
      unsubscribe();
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, [onEmote, play]);

  return bubbles;
}
