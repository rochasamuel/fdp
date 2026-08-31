import { anchorRef } from "../game/flights";
import { backUrl } from "../lib/cards";
import { useUi } from "../store/ui";

const DRAW_MAX = 6;

/**
 * O monte: o que sobrou do baralho depois de a rodada ser repartida.
 *
 * No FDP não se compra carta — quem tem carta joga, e a mão só encolhe. Então
 * isto não é um botão: é a medida do que ficou de fora nesta rodada, e a
 * âncora de onde as cartas do reparto partem voando.
 *
 * Every card here is the same file, so the browser decodes the back art once.
 */
export function DrawPile({ remaining }: { remaining: number }) {
  const back = useUi((ui) => ui.back);
  const depth = Math.max(1, Math.min(DRAW_MAX, Math.ceil(remaining / 8)));

  return (
    <div
      // De onde toda carta repartida parte, e a medida de uma carta na mesa.
      ref={anchorRef("draw")}
      className="fdp-stack fdp-draw"
      role="img"
      aria-label={`Monte — ${remaining} cartas fora da rodada`}
    >
      {Array.from({ length: depth }, (_, index) => {
        const step = (depth - 1 - index) * 2;
        return (
          <img
            key={index}
            className="fdp-card"
            src={backUrl(back)}
            alt=""
            style={{ "--dx": `${-step}px`, "--dy": `${-step}px` } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
