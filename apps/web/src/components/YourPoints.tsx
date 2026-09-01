import { STARTING_POINTS } from "@fdp/shared";

/**
 * Quantos casulos cabem numa fileira. Acima disto ela deixa de ser lida de
 * relance: vira quatro linhas de quadradinhos que ninguém conta.
 */
const LAYER = 10;

/**
 * A cor de cada camada, de baixo para cima. A de baixo é o rosa de sempre —
 * numa mesa de dez pontos, que é o padrão, a fileira continua exatamente como
 * era. As de cima só existem em mesas mais longas.
 */
const LAYER_COLORS = [
  "var(--mark)",
  "var(--pip-amber)",
  "var(--pip-green)",
  "var(--pip-blue)",
  "var(--pip-violet)",
];

/**
 * Os seus pontos como quadradinhos, e não como um número: o que importa não é
 * "6", é o tanto que já apagou — a distância até a porta da rua se lê de
 * relance, sem ninguém precisar fazer a subtração de cabeça.
 *
 * Numa mesa de até dez pontos a fileira é a sua vida inteira. Acima disso ela
 * vira a camada de cima de uma pilha: dez casulos por camada, cada camada com
 * a sua cor, e quando a última apaga a fileira volta cheia na cor de baixo —
 * como uma casca que se descasca. O casulo apagado mostra, em surdina, a cor
 * do que vem embaixo, para dar de relance quanto ainda falta descer.
 */
export function YourPoints({
  points,
  total = STARTING_POINTS,
  className = "",
}: {
  points: number;
  total?: number;
  className?: string;
}) {
  const seats = Math.max(total, points);
  // A camada em que você está, contada de baixo (0) para cima. Em ponto
  // redondo — 20 numa mesa de 30 — você ainda está na camada de cima, cheia.
  const layer = Math.max(0, Math.ceil(points / LAYER) - 1);
  // Quantos casulos esta camada tem: dez, ou o resto, se a mesa não senta num
  // múltiplo de dez (uma mesa de 15 tem uma camada de 10 e uma de 5).
  const size = Math.min(LAYER, seats - layer * LAYER);
  const lit = points - layer * LAYER;
  const color = LAYER_COLORS[layer % LAYER_COLORS.length];
  const under = layer > 0 ? LAYER_COLORS[(layer - 1) % LAYER_COLORS.length] : "";

  return (
    <p
      className={`flex flex-wrap items-center gap-1 ${className}`}
      aria-label={`${points} de ${seats} pontos`}
    >
      {Array.from({ length: size }, (_, index) => (
        <span
          key={index}
          className={`fdp-pip ${index < lit ? "" : `is-spent ${under ? "has-under" : ""}`}`}
          style={
            {
              "--pip": color,
              ...(under ? { "--pip-under": under } : {}),
            } as React.CSSProperties
          }
        />
      ))}
      <span className="px-label pl-2">{points} pontos</span>
    </p>
  );
}
