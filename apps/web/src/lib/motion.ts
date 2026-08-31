/**
 * O sistema pergunta uma coisa e a pessoa pode responder outra.
 *
 * O `prefers-reduced-motion` do sistema operacional continua valendo — ele é o
 * padrão de quem nunca abriu os ajustes. Mas ele é uma chave só para o
 * computador inteiro, e uma mesa de cartas é justamente o lugar onde alguém
 * pode querer desligar o movimento sem desligá-lo no resto do dia. Daí a
 * chave da mesa, que soma: movimento reduzido é o sistema OU a pessoa.
 */

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Avisa quando a chave do sistema virar, para a classe do <html> acompanhar. */
export function watchReducedMotion(onChange: () => void) {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
