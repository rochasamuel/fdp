import { STARTING_POINTS } from "@fdp/shared";

/**
 * Acima disto a fileira de casulos deixa de ser lida de relance: ela vira
 * quatro linhas de quadradinhos que ninguém conta. Numa mesa comprida o que se
 * lê é o número, e o quanto já apagou vira uma barra.
 */
const PIP_LIMIT = 20;

/**
 * Os seus pontos como quadradinhos, e não como um número: o que importa não é
 * "6", é o tanto que já apagou — a distância até a porta da rua se lê de
 * relance, sem ninguém precisar fazer a subtração de cabeça.
 *
 * Os casulos ficam sempre lá; o que muda é quais ainda estão acesos. Quantos
 * são vem da mesa (`total`), porque cada mesa escolhe com quantos pontos todo
 * mundo senta.
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
  return (
    <p
      className={`flex flex-wrap items-center gap-1 ${className}`}
      aria-label={`${points} de ${seats} pontos`}
    >
      {seats <= PIP_LIMIT ? (
        Array.from({ length: seats }, (_, index) => (
          <span key={index} className={`fdp-pip ${index < points ? "" : "is-spent"}`} />
        ))
      ) : (
        <span className="fdp-pip-bar" aria-hidden>
          <span style={{ width: `${(points / seats) * 100}%` }} />
        </span>
      )}
      <span className="px-label pl-2">{points} pontos</span>
    </p>
  );
}
