import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cardLabel, cardPower, type Card } from "@fdp/shared";
import { artUrl } from "../lib/cards";

type Props = {
  /** De quem é a mão. Vai no cabeçalho do painel, que sai de perto do assento. */
  name: string;
  /** A mão dele, aberta. */
  cards: Card[];
};

/**
 * O olho de quem já saiu da mesa: a mão de um jogador que ainda está de pé.
 *
 * Quem foi eliminado continua olhando a partida, e para ele o segredo não
 * protege mais nada — não joga, não canta e não tem como levar o que vê para
 * dentro do jogo. Então a informação é aberta, mas não empurrada: fica atrás
 * de um olho por assento, e quem assiste escolhe quais abrir. Vários ao mesmo
 * tempo, porque o que se quer ver assistindo é justamente a comparação entre
 * duas mãos.
 *
 * O painel é FILHO DO BODY, e não do assento. Na mesa redonda a cadeira vem
 * posicionada por `transform`, e um `position: fixed` dentro dela passa a
 * medir-se pela cadeira em vez da janela: o painel nasceria torto e cortado
 * pela borda. Pendurado no body ele não tem ancestral que o recorte, e a
 * posição é conta nossa — presa ao botão e presa dentro da janela.
 */
export function SpyPeek({ name, cards }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // A mão em ordem de força, e não na ordem em que ele a recebeu: assistindo,
  // o que se lê de uma mão é a maior carta que ela tem.
  const ordered = useMemo(
    () => [...cards].sort((a, b) => cardPower(b) - cardPower(a)),
    [cards],
  );

  /*
   * O painel encostado no botão e sempre inteiro na tela: centrado nele,
   * empurrado para dentro das bordas laterais, e virado para cima quando não
   * cabe embaixo. `useLayoutEffect` porque a conta precisa do tamanho já
   * medido — e antes de a tela pintar, senão o painel aparece num lugar e
   * salta para o outro.
   */
  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const button = btnRef.current;
      const panel = panelRef.current;
      if (!button || !panel) return;
      const anchor = button.getBoundingClientRect();
      const { offsetWidth: w, offsetHeight: h } = panel;
      /*
       * A folga da borda é maior do que a estética pede: a carta sob o cursor
       * CRESCE, e ela cresce para fora do painel. Reservar essa folga aqui é o
       * que faz a carta ampliada continuar inteira na tela em vez de terminar
       * cortada pela janela — que é o único lugar onde o corte não teria
       * remédio, porque não existe rolagem para alcançá-lo.
       */
      const side = 32;
      const edge = 48;
      const gap = 8;

      const left = clamp(
        anchor.left + anchor.width / 2 - w / 2,
        side,
        Math.max(side, window.innerWidth - w - side),
      );
      const below = anchor.bottom + gap;
      const top =
        below + h <= window.innerHeight - edge
          ? below
          : clamp(anchor.top - gap - h, edge, Math.max(edge, window.innerHeight - h - edge));

      setPos((old) => (old && old.left === left && old.top === top ? old : { left, top }));
    };

    place();
    // Enquanto está aberto, e só então: a mesa não rola, mas a janela muda de
    // tamanho e a fileira de assentos se remonta quando alguém sai.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, ordered.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`fdp-eye ${open ? "is-open" : ""}`}
        aria-expanded={open}
        aria-label={`Ver a mão de ${name}`}
        title={`Ver a mão de ${name}`}
        onClick={() => {
          setPos(null);
          setOpen((was) => !was);
        }}
      >
        👀 <b>{cards.length}</b>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="px-slab fdp-spy"
            // Antes da primeira medida o painel fica fora da tela: ele precisa
            // existir para ser medido, e não precisa ser visto torto.
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
            role="dialog"
            aria-label={`Mão de ${name}`}
          >
            <p className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm" style={{ color: "var(--paper-hi)" }}>
                {name}
              </span>
              <span className="px-label shrink-0">{cards.length} cartas</span>
            </p>
            <div className="fdp-spy-cards">
              {ordered.map((card) => (
                <img
                  key={card.id}
                  className="fdp-spy-card"
                  src={artUrl(card)}
                  alt={cardLabel(card)}
                  title={cardLabel(card)}
                  draggable={false}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
