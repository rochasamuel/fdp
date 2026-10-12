import type { CSSProperties } from "react";

/* ---- a mesa redonda ------------------------------------------------------
 * Você está embaixo, do lado de cá da tela, com o leque na mão — esse é o seu
 * lugar na roda, e é por isso que a roda é um ARCO e não um círculo fechado: o
 * pedaço que falta é você. Os outros se sentam em volta das pilhas, na ordem
 * em que jogam, saindo da sua esquerda.
 *
 * Sair pela esquerda não é gosto: com você embaixo olhando para a mesa, o
 * sentido horário — o que o cabeçalho chama de "↻ horário" — passa por baixo à
 * esquerda, sobe, cruza o topo e desce à direita. Quem inverte a mesa não
 * remexe os assentos, só vira as setas; ninguém troca de cadeira no meio da
 * partida por causa de um carta de inverter.
 * ------------------------------------------------------------------------- */

/** O arco todo, e o quanto pode caber entre um assento e o vizinho. */
const RING_SPAN = 220;
const RING_GAP = 70;

/*
 * Os dois raios da elipse, em porcentagem da caixa dos assentos.
 *
 * O horizontal é metade da largura, sem mistério. O vertical é maior que
 * metade da altura, e o centro desce junto: como o arco para nos 110° e não
 * fecha embaixo, uma elipse inscrita na caixa deixaria o terço de baixo dela
 * vazio — uma faixa de feltro entre o assento mais baixo e a sua mão. Esticada
 * assim, o topo do arco encosta no topo da caixa e as pontas encostam no
 * fundo; o pedaço que sobra para fora, embaixo, é o seu lugar na roda.
 */
const RING_RX = 50;
const RING_RY = 100 / (1 - Math.cos((RING_SPAN / 2) * (Math.PI / 180)));

export type Box = { w: number; h: number };
type Slot = { x: number; y: number };

/**
 * Onde cada assento se senta e onde cada seta fica, em porcentagem da caixa
 * dos assentos. Porcentagem porque a elipse é a caixa: quem decide o tamanho
 * da roda é o CSS, que sabe quanto sobrou de tela.
 */
export function ringLayout(count: number, direction: number, box: Box) {
  const angles = evenArc(count, Math.min(RING_SPAN, RING_GAP * (count - 1)), box);

  return {
    seats: angles.map(onEllipse),
    // A seta de índice i fica entre o assento i e o i+1.
    flows: angles.slice(1).map((angle, i) => ({
      ...onEllipse((angles[i] + angle) / 2),
      glyph: tangent((angles[i] + angle) / 2, direction, box),
    })),
  };
}

/**
 * Os ângulos que repartem o arco em pedaços do mesmo COMPRIMENTO — e não do
 * mesmo ângulo.
 *
 * A roda é uma elipse larga e baixa, e nela um grau vale coisas muito
 * diferentes conforme onde se está: no topo, meia mesa; na lateral, um palmo.
 * Repartindo por ângulo, os assentos das pontas se amontoam justamente onde
 * cada um deles é mais alto — o "PEGAR" e o "TROCAR" nascem ali — e dois
 * vizinhos acabam se encostando numa tela de notebook.
 *
 * Sem fórmula fechada para o arco de elipse: mede-se andando, em 720 passos,
 * e depois pescam-se as marcas. São umas poucas centenas de contas por
 * mudança de tamanho da caixa (o `useMemo` de quem chama segura o resto).
 */
function evenArc(count: number, span: number, box: Box) {
  if (count < 2) return [0];

  const rx = (box.w * RING_RX) / 100;
  const ry = (box.h * RING_RY) / 100;
  const at = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return { x: rx * Math.sin(radians), y: -ry * Math.cos(radians) };
  };

  const STEPS = 720;
  const step = span / STEPS;
  const walked = [0];
  for (let i = 1; i <= STEPS; i++) {
    const from = at(-span / 2 + step * (i - 1));
    const to = at(-span / 2 + step * i);
    walked.push(walked[i - 1] + Math.hypot(to.x - from.x, to.y - from.y));
  }

  const total = walked[STEPS];
  let cursor = 0;
  return Array.from({ length: count }, (_, i) => {
    const target = (total * i) / (count - 1);
    while (cursor < STEPS && walked[cursor + 1] < target) cursor++;
    // Entre uma marca e a seguinte o arco é reto o bastante para uma regra de três.
    const stretch = walked[cursor + 1] - walked[cursor];
    const into = stretch === 0 ? 0 : (target - walked[cursor]) / stretch;
    return -span / 2 + step * (cursor + into);
  });
}

/** Ângulo em graus a partir do topo, crescendo no sentido horário. */
function onEllipse(degrees: number): Slot {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: RING_RX + RING_RX * Math.sin(radians),
    y: RING_RY - RING_RY * Math.cos(radians),
  };
}

/** As oito setas, começando na que aponta para a direita e girando com o relógio. */
const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];

/**
 * Para onde o arco segue neste ponto, arredondado para uma das oito setas. A
 * derivada da elipse em relação ao ângulo é (largura·cos, altura·sen) — e é aí
 * que a proporção da caixa entra: num arco largo e baixo o topo é quase
 * horizontal, e a seta certa lá é "→" e não "↗".
 */
function tangent(degrees: number, direction: number, box: Box) {
  const radians = (degrees * Math.PI) / 180;
  const dx = box.w * RING_RX * Math.cos(radians) * direction;
  const dy = box.h * RING_RY * Math.sin(radians) * direction;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ARROWS[(octant + 8) % 8];
}

/** O lugar na elipse virando as duas custom properties que o CSS lê. */
export const at = ({ x, y }: Slot) => ({ "--x": `${x}%`, "--y": `${y}%` }) as CSSProperties;
