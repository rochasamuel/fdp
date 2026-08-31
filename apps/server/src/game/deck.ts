import { DECK_JOKER, RANKS, SUITS, type Card } from "@fdp/shared";

/**
 * O baralho do FDP: as 52 cartas francesas e UM coringa, na mesma ordem em que
 * `tools/cards/gen_card.py` desenha as artes.
 *
 * Um coringa, e não os dois, porque a hierarquia do jogo é uma ordem TOTAL: o
 * segundo coringa seria a única carta capaz de empatar uma vaza, e um empate é
 * uma pergunta que a regra não responde. A arte do outro continua existindo —
 * ela só não entra em partida.
 */
export function createDeck({ joker = true } = {}): Card[] {
  const cards: Card[] = [];
  const add = (card: Omit<Card, "id">) => cards.push({ ...card, id: `c${cards.length}` });

  for (const suit of SUITS) {
    for (const rank of RANKS) add({ suit, rank });
  }
  if (joker) add({ suit: "joker", rank: DECK_JOKER });
  return cards;
}

/** Fisher-Yates, no lugar. */
export function shuffle<T>(cards: T[], random: () => number): T[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
