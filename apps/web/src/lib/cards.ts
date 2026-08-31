import {
  cardArt,
  cardPower,
  isJoker,
  isRed,
  isSameCard,
  PORCAO,
  PORCAO_ARMED,
  SUIT_PIP,
  ZAP,
  type Card,
  type Suit,
} from "@fdp/shared";

export const artUrl = (card: Pick<Card, "suit" | "rank">) => `/cards/svg/${cardArt(card)}.svg`;

/**
 * Os versos. São oito em `public/cards/svg/` e todos usam a mesma paleta, então
 * qualquer um deles lê igual sobre qualquer pano: escolher o verso é escolher o
 * baralho, não mexer na interface.
 *
 * Como o pano, é de quem olha e não da sala — o verso em uso mora no store
 * (`back` em `store/ui.ts`), e aqui ficam só a lista e os nomes, que é o que a
 * tela precisa para desenhar a fileira de amostras.
 */
export const BACKS = [
  { key: "weave", label: "Trama" },
  { key: "zigzag", label: "Zigue-zague" },
  { key: "argyle", label: "Losango" },
  { key: "bloom", label: "Flor" },
  { key: "ripple", label: "Onda" },
  { key: "maze", label: "Labirinto" },
  { key: "basket", label: "Cesta" },
  { key: "planet", label: "Planeta" },
] as const;

export type Back = (typeof BACKS)[number]["key"];

export const DEFAULT_BACK: Back = "weave";

export const isBack = (value: unknown): value is Back =>
  BACKS.some((back) => back.key === value);

export const backUrl = (back: Back) => `/cards/svg/fdp-back-${back}.svg`;

/** A tinta de cada naipe, na mesma divisão que o baralho imprime. */
export const SUIT_HEX: Record<Suit | "joker", string> = {
  spades: "var(--ink-black)",
  clubs: "var(--ink-black)",
  hearts: "var(--ink-red)",
  diamonds: "var(--ink-red)",
  joker: "var(--mark)",
};

export const suitPip = (suit: Suit | "joker") => SUIT_PIP[suit];

export const cardHex = (card: Pick<Card, "suit" | "rank">) =>
  isRed(card) ? "var(--ink-red)" : SUIT_HEX[card.suit];

/**
 * A carta em dois caracteres: `10♥`, `A♠`, `★` para o coringa.
 *
 * Para onde não cabe a arte. O coringa não tem naipe para exibir — a tinta dele
 * é a informação, e quem a dá é a cor do texto.
 */
export const cardShort = (card: Pick<Card, "suit" | "rank">) =>
  isJoker(card) ? SUIT_PIP.joker : `${card.rank.toUpperCase()}${SUIT_PIP[card.suit]}`;

function hash(n: number) {
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return ((n ^ (n >>> 15)) >>> 0) / 2 ** 32;
}

/**
 * O tanto de bagunça com que uma carta pousa no centro. Sai do índice dela na
 * pilha, e nunca de `Math.random()`, que reembaralharia a pilha inteira a cada
 * render. A dispersão cresce com a pilha, então oito cartas desenhadas parecem
 * trinta.
 */
export function scatter(index: number, pileSize: number, isTop: boolean) {
  const growth = Math.min(1, pileSize / 24);
  const spread = isTop ? 5 : 16 + 4 * growth;
  const offset = 9 + 3.5 * growth;
  return {
    rot: (hash(index * 3 + 1) * 2 - 1) * spread,
    dx: (hash(index * 3 + 2) * 2 - 1) * offset,
    dy: (hash(index * 3 + 3) * 2 - 1) * offset,
  };
}

/**
 * Qual carta da pilha é a MAIOR — a que fica por cima e ganha o espalhamento
 * curto do topo. É a leitura que o centro deve dar de graça: quem está
 * ganhando a vaza se vê sem contar carta por carta.
 *
 * A força é a da tabela, com uma exceção: o porcão só é a carta mais forte do
 * baralho com o zap na mesa, e a mais fraca sem ele. Fora isso a hierarquia é
 * uma ordem total — não há empate para desempatar.
 *
 * O cangar não entra aqui. Ele decide quem LEVA a vaza, anulando valores
 * repetidos; a maior carta da mesa continua sendo a maior, e é ela que a pilha
 * mostra.
 */
export function strongestIndex(cards: Pick<Card, "suit" | "rank">[], porcao: boolean) {
  const armed = porcao && cards.some((card) => isSameCard(card, ZAP));
  const strength = (card: Pick<Card, "suit" | "rank">) =>
    porcao && isSameCard(card, PORCAO) ? (armed ? PORCAO_ARMED : 0) : cardPower(card);

  let best = -1;
  let top = -Infinity;
  cards.forEach((card, index) => {
    const power = strength(card);
    if (power > top) {
      top = power;
      best = index;
    }
  });
  return best;
}
