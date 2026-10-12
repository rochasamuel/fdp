import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cardLabel, toCard, type PublicCard } from "@fdp/shared";
import { anchorRef, useFlightStore } from "../game/flights";
import { artUrl, scatter, strongestIndex } from "../lib/cards";

/**
 * O centro da mesa: onde a carta jogada pousa.
 *
 * O que o centro SIGNIFICA é decisão da regra que o FDP ainda não tem — monte
 * de descarte, vaza, aposta. O que ele já é, e vale para qualquer uma delas, é
 * uma pilha bagunçada com o topo à mostra e um alvo para o arrasto.
 *
 * O topo é a MAIOR carta da mesa, e não a última baixada: a pilha é o retrato
 * de quem está ganhando a vaza. Carta que entra por cima da maior passa por
 * baixo dela, o que é justamente o que a jogada significa.
 *
 * Só que, entrando por baixo, a carta some no mesmo instante em que pousa — e
 * ninguém chega a ver o que foi descartado. Por isso a recém-chegada fica por
 * cima de tudo durante `SPOTLIGHT_MS`, na mesma pose, e só então é enfiada
 * debaixo da maior: sai para baixo, passa por trás e volta à pose de repouso
 * (`fdp-tuck` no index.css). Começa e termina no mesmo lugar, então o pouso
 * continua sendo o pouso.
 */

/** Quanto tempo a carta recém-baixada fica à mostra antes de ir para baixo. */
const SPOTLIGHT_MS = 800;
/** A volta por trás da maior. O mesmo número da animação `fdp-tuck`. */
const TUCK_MS = 420;

/** A recém-chegada: parada por cima de tudo, ou a caminho de baixo. */
type Spotlight = { id: string; phase: "shown" | "tucking" } | null;

type Props = {
  /** A ponta visível da pilha, da mais antiga para a mais recente. */
  cards: PublicCard[];
  total: number;
  /** A regra do porcão muda qual é a maior carta da mesa. */
  porcao: boolean;
  armed: boolean;
  ref: React.RefObject<HTMLDivElement | null>;
};

export function CentrePile({ cards, total, porcao, armed, ref }: Props) {
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

  /*
   * Quem é o topo se decide pela pilha inteira, e não pelo que está visível:
   * com a maior ainda no ar, a segunda viraria "topo", trocaria de
   * espalhamento e voltaria atrás quando a outra pousasse.
   */
  const topId = cards[strongestIndex(cards.map(toCard), porcao)]?.id;

  useEffect(() => {
    seen.current = total;
  }, [total]);

  /*
   * A recém-chegada só conta depois de pousar: enquanto voa, a última carta da
   * pilha não está à mostra, e o relógio não pode começar com ela no ar.
   * `useLayoutEffect` para que ela nunca seja pintada um quadro por baixo antes
   * de subir.
   */
  const last = cards.at(-1);
  const newestId = last && !airborne.has(last.id) ? last.id : undefined;
  const lastNewest = useRef(newestId);
  const [spotlight, setSpotlight] = useState<Spotlight>(null);
  const spotlightTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useLayoutEffect(() => {
    if (newestId === lastNewest.current) return;
    lastNewest.current = newestId;
    // Uma carta nova interrompe a anterior: ela vai direto para a pose de
    // repouso, por baixo, sem terminar a volta.
    spotlightTimers.current.forEach(clearTimeout);
    // A maior já fica por cima de qualquer jeito: destacá-la não mostraria nada.
    if (!newestId || newestId === topId) return setSpotlight(null);
    const id = newestId;
    setSpotlight({ id, phase: "shown" });
    spotlightTimers.current = [
      setTimeout(() => setSpotlight({ id, phase: "tucking" }), SPOTLIGHT_MS),
      setTimeout(() => setSpotlight(null), SPOTLIGHT_MS + TUCK_MS),
    ];
  }, [newestId, topId]);

  useEffect(() => () => spotlightTimers.current.forEach(clearTimeout), []);

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
        const isTop = card.id === topId;
        const { rot, dx, dy } = scatter(index, total, isTop);
        const lit = spotlight?.id === card.id ? spotlight.phase : null;
        return (
          <img
            key={index}
            className={`fdp-card ${index >= seen.current ? "is-dealt" : ""} ${
              lit === "tucking" ? "is-tucking" : ""
            }`}
            src={artUrl(toCard(card))}
            alt={isTop ? cardLabel(toCard(card)) : ""}
            style={
              {
                "--rot": `${rot}deg`,
                "--dx": `${dx}%`,
                "--dy": `${dy}%`,
                // Na volta, quem troca a camada é a própria animação, no meio
                // do caminho — ver `fdp-tuck`.
                zIndex: lit === "shown" ? 3 : isTop ? 2 : undefined,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
