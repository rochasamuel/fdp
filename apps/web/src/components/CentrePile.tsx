import { useCallback, useEffect, useRef } from "react";
import { cardLabel, toCard, type PublicCard } from "@fdp/shared";
import { anchorRef, useFlightStore } from "../game/flights";
import { artUrl, scatter } from "../lib/cards";

/**
 * O centro da mesa: onde a carta jogada pousa.
 *
 * O que o centro SIGNIFICA é decisão da regra que o FDP ainda não tem — monte
 * de descarte, vaza, aposta. O que ele já é, e vale para qualquer uma delas, é
 * uma pilha bagunçada com o topo à mostra e um alvo para o arrasto.
 */

type Props = {
  /** A ponta visível da pilha, da mais antiga para a mais recente. */
  cards: PublicCard[];
  total: number;
  armed: boolean;
  ref: React.RefObject<HTMLDivElement | null>;
};

export function CentrePile({ cards, total, armed, ref }: Props) {
  // A carta que ainda está voando até aqui não pode já estar na pilha.
  const airborne = useFlightStore((state) => state.heldCentre);
  const shown = airborne.size > 0 ? cards.filter((card) => !airborne.has(card.id)) : cards;

  /*
   * `seen` acompanha o total REAL, não o que está visível. É o que faz o
   * `is-dealt` — a queda de 46px que a carta dá ao entrar na pilha — valer só
   * para quem chegou sem voar: movimento reduzido, âncora ausente, ou entrar
   * numa partida já em andamento. Quem veio voando já pousou na pose final, e
   * uma segunda queda por cima disso é o salto que se quer evitar.
   */
  const seen = useRef(total);
  const base = total - cards.length;

  useEffect(() => {
    seen.current = total;
  }, [total]);

  // Um elemento, dois papéis: alvo do arrasto (o Table precisa medi-lo) e
  // âncora dos voos. Cada um quer a sua própria ref.
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element;
      anchorRef("centre")(element);
    },
    [ref],
  );

  return (
    <div
      ref={attach}
      className={`fdp-stack fdp-centre fdp-drop-zone ${armed ? "is-armed" : ""}`}
    >
      {shown.map((card, offset) => {
        // A chave é o índice na pilha INTEIRA. Com o índice dentro da fatia
        // visível, cada jogada desliza a janela e o React recicla os nós
        // errados — as cartas trocam de lugar sozinhas.
        const index = base + offset;
        // Quem é o topo se decide pela pilha inteira, não pelo que está
        // visível: com a carta de cima ainda no ar, a de baixo viraria "topo",
        // trocaria de espalhamento e voltaria atrás quando a outra pousasse.
        const isTop = index === total - 1;
        const { rot, dx, dy } = scatter(index, total, isTop);
        return (
          <img
            key={index}
            className={`fdp-card ${index >= seen.current ? "is-dealt" : ""}`}
            src={artUrl(toCard(card))}
            alt={isTop ? cardLabel(toCard(card)) : ""}
            style={
              {
                "--rot": `${rot}deg`,
                "--dx": `${dx}%`,
                "--dy": `${dy}%`,
                zIndex: isTop ? 2 : undefined,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
