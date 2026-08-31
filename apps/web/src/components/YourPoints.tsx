import { STARTING_POINTS } from "@fdp/shared";

/**
 * Os seus pontos como dez quadradinhos, e não como um número: o que importa
 * não é "6", é o tanto que já apagou — a distância até a porta da rua se lê de
 * relance, sem ninguém precisar fazer a subtração de cabeça.
 *
 * Os dez casulos ficam sempre lá; o que muda é quais ainda estão acesos.
 */
export function YourPoints({ points, className = "" }: { points: number; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-1 ${className}`} aria-label={`${points} pontos`}>
      {Array.from({ length: STARTING_POINTS }, (_, index) => (
        <span key={index} className={`fdp-pip ${index < points ? "" : "is-spent"}`} />
      ))}
      <span className="px-label pl-2">{points} pontos</span>
    </p>
  );
}
