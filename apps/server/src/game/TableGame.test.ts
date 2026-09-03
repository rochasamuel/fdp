import { describe, expect, it } from "vitest";
import {
  DECK_JOKER,
  DECK_SIZE,
  allowedPromises,
  SUIT_LADDER,
  cardPower,
  forbiddenPromise,
  isSpecialCard,
  maxHandSize,
  nextHandSize,
  pointsLost,
  type Card,
} from "@fdp/shared";
import { createDeck } from "./deck.js";
import { GameError, TableGame } from "./TableGame.js";

/*
 * As regras do FDP, conferidas contra o documento que as define. O que se testa
 * aqui não é o transporte nem a tela: é a regra pura, no objeto que é a
 * autoridade sobre ela. Nada aqui espera relógio — os passos que a sala agenda
 * (a vaza fechada saindo da mesa, o placar da rodada) são chamados na mão por
 * `resume()`.
 */

/** Uma carta pelo par (naipe, valor). O id é o próprio par: dá para lê-lo. */
const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({
  id: `${suit}-${rank}`,
  suit,
  rank,
});

/** Uma mesa com gente sentada e ninguém tendo começado nada. */
function table(count: number, random = () => 0) {
  const game = new TableGame(random);
  for (let i = 0; i < count; i++) game.addPlayer(`p${i}`, `k${i}`, `P${i}`);
  return game;
}

/** Uma mesa já repartida, na fase de promessas. */
function started(count: number) {
  const game = table(count);
  game.start("p0");
  return game;
}

/**
 * Roda a rodada inteira com as mãos e as promessas ditadas, e para no placar.
 * Cada um baixa sempre a primeira carta da mão, que com a mão ditada é a mesma
 * coisa que ditar a jogada.
 */
function playRound(
  game: TableGame,
  hands: Record<string, Card[]>,
  promises: Record<string, number>,
) {
  for (const player of game.active) player.hand = [...hands[player.id]];
  while (game.stage === "making_promises") {
    const turn = game.currentPlayer!;
    game.makePromise(turn.id, promises[turn.id]);
  }
  while (game.stage === "playing_trick") {
    if (game.pending) {
      game.resume();
      continue;
    }
    const turn = game.currentPlayer!;
    game.playCard(turn.id, turn.hand[0].id);
  }
}

/** Declara as promessas ditadas, na ordem em que a mesa as pede. */
function bid(game: TableGame, promises: Record<string, number>) {
  while (game.stage === "making_promises") {
    const turn = game.currentPlayer!;
    game.makePromise(turn.id, promises[turn.id]);
  }
}

/** Baixa a primeira carta da mão de quem tem a vez até a rodada fechar. */
function playAll(game: TableGame) {
  while (game.stage === "playing_trick") {
    if (game.pending) {
      game.resume();
      continue;
    }
    const turn = game.currentPlayer!;
    game.playCard(turn.id, turn.hand[0].id);
  }
}

/**
 * Uma mesa já com as promessas feitas, pronta para a vaza, e a ordem em que os
 * jogadores vão baixar — começando por quem sai. As mãos ficam para o teste
 * ditar; o que este helper resolve é não ter de adivinhar de quem é a vez.
 */
function openTrick(count: number, rules?: Partial<TableGame["rules"]>) {
  const game = table(count);
  if (rules) game.rules = { cangar: false, porcao: false, ...rules };
  game.start("p0");
  while (game.stage === "making_promises") {
    const turn = game.currentPlayer!;
    game.makePromise(turn.id, game.promiseOptions(turn.id)[0]);
  }
  const first = game.active.indexOf(game.currentPlayer!);
  const order = Array.from({ length: count }, (_, i) => game.active[(first + i) % count]);
  return { game, order };
}

/**
 * Uma mesa de dois na rodada de DUAS cartas, que é a menor em que os dois
 * jogadores conseguem errar a promessa ao mesmo tempo. Devolve quem declara (e
 * sai) primeiro, para o teste não ter de adivinhar de quem é a vez depois de o
 * dealer andar uma casa.
 */
function twoCardShowdown() {
  const game = started(2);
  playRoundWith(game, {}); // a rodada de uma carta, para chegar na de duas
  expect(game.cardsPerPlayer).toBe(2);

  const first = game.currentPlayer!;
  const second = game.active.find((player) => player.id !== first.id)!;
  return { game, first, second };
}

/* ------------------------------------------------------------ distribuição */

describe("quantas cartas cabem na mesa", () => {
  it("leva um coringa só, e nunca os dois", () => {
    const deck = createDeck();
    const jokers = deck.filter((card) => card.suit === "joker");

    expect(deck).toHaveLength(DECK_SIZE);
    expect(jokers).toHaveLength(1);
    expect(jokers[0].rank).toBe(DECK_JOKER);

    /*
     * As cinco especiais são ÚNICAS no baralho: cada uma tem uma força que
     * nenhuma outra carta tem. Com os dois coringas, a mais forte das especiais
     * a empatar seria justamente o coringa consigo mesmo.
     *
     * As comuns continuam empatando entre si — quatro cincos, uma força só —, e
     * quem resolve isso é a regra da vaza: no empate vale quem baixou primeiro.
     */
    const specials = deck.filter(isSpecialCard);
    expect(specials).toHaveLength(5);
    expect(new Set(specials.map(cardPower)).size).toBe(5);
    for (const special of specials) {
      const iguais = deck.filter((other) => cardPower(other) === cardPower(special));
      expect(iguais).toHaveLength(1);
    }
  });

  it("divide o baralho igualmente, e o que sobra fica fora", () => {
    expect(createDeck()).toHaveLength(DECK_SIZE);
    expect(maxHandSize(1)).toBe(53);
    expect(maxHandSize(2)).toBe(26); // 53/2 = 26,5 — a que sobra fica fora
    expect(maxHandSize(3)).toBe(17);
    expect(maxHandSize(4)).toBe(13);
    expect(maxHandSize(5)).toBe(10);
    expect(maxHandSize(10)).toBe(5);
  });

  it("sobe de um em um e volta para 1 quando não cabe mais", () => {
    expect(nextHandSize(1, 5)).toBe(2);
    expect(nextHandSize(9, 5)).toBe(10);
    // Com 5 jogadores o máximo é 10: não há baralho para 11 cada.
    expect(nextHandSize(10, 5)).toBe(1);
    expect(nextHandSize(5, 10)).toBe(1);
  });

  it("reparte a mesma quantidade para todo mundo, rodada após rodada", () => {
    const game = started(3);
    const sizes: number[] = [];

    for (let round = 0; round < 6; round++) {
      sizes.push(game.cardsPerPlayer);
      const hands = Object.fromEntries(
        game.active.map((player) => [player.id, player.hand.map((c) => c)]),
      );
      // Todas as mãos com o mesmo tamanho, e nenhuma carta em duas mãos.
      const all = Object.values(hands).flat();
      expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
      for (const hand of Object.values(hands)) expect(hand).toHaveLength(game.cardsPerPlayer);

      // Promessas que nunca somam o número de cartas: a regra já garante isso,
      // e aqui só se quer chegar à rodada seguinte.
      const promises: Record<string, number> = {};
      playRoundWith(game, promises);
    }

    expect(sizes).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("respeita o teto da mesa e volta para 1 antes de o baralho estourar", () => {
    expect(nextHandSize(2, 5, 3)).toBe(3);
    // O teto corta o ciclo em 3, e não nos 10 que o baralho ainda daria.
    expect(nextHandSize(3, 5, 3)).toBe(1);
    // Teto maior do que cabe não estica nada: quem manda continua sendo o baralho.
    expect(nextHandSize(5, 10, 30)).toBe(1);
    expect(maxHandSize(5, 3)).toBe(3);
    expect(maxHandSize(5, 30)).toBe(10);

    const game = table(3);
    game.maxCards = 3;
    game.start("p0");
    const sizes: number[] = [];
    for (let round = 0; round < 5; round++) {
      sizes.push(game.cardsPerPlayer);
      playRoundWith(game, {});
    }
    expect(sizes).toEqual([1, 2, 3, 1, 2]);
  });

  it("volta para 1 carta quando o ciclo estoura o baralho", () => {
    const game = started(10); // máximo: 5 cartas por jogador
    const sizes: number[] = [];
    for (let round = 0; round < 7; round++) {
      sizes.push(game.cardsPerPlayer);
      playRoundWith(game, {});
    }
    expect(sizes).toEqual([1, 2, 3, 4, 5, 1, 2]);
  });

  it("não começa uma partida com menos de dois jogadores", () => {
    const game = table(1);
    expect(() => game.start("p0")).toThrow(GameError);
    expect(game.stage).toBe("waiting_for_players");
  });
});

/**
 * Roda a rodada com as mãos que foram repartidas, escolhendo promessas legais,
 * e devolve o placar dela — a rodada seguinte apaga o `results` do jogo.
 */
function playRoundWith(game: TableGame, promises: Record<string, number>) {
  while (game.stage === "making_promises") {
    const turn = game.currentPlayer!;
    const options = game.promiseOptions(turn.id);
    game.makePromise(turn.id, promises[turn.id] ?? options[0]);
  }
  while (game.stage === "playing_trick") {
    if (game.pending) {
      game.resume();
      continue;
    }
    const turn = game.currentPlayer!;
    game.playCard(turn.id, turn.hand[0].id);
  }
  const results = game.results.map((result) => ({ ...result }));
  // placar -> eliminação (se houver) -> rodada seguinte
  while (game.stage === "round_result" || game.stage === "player_elimination") game.resume();
  return results;
}

/* ------------------------------------------------------------------ dealer */

describe("o dealer", () => {
  it("abre as promessas pelo jogador à direita dele, e declara por último", () => {
    const game = started(4);
    expect(game.dealer!.id).toBe("p0");
    expect(game.currentPlayer!.id).toBe("p1");

    const ordem: string[] = [];
    while (game.stage === "making_promises") {
      const turn = game.currentPlayer!;
      ordem.push(turn.id);
      game.makePromise(turn.id, game.promiseOptions(turn.id)[0]);
    }
    expect(ordem).toEqual(["p1", "p2", "p3", "p0"]);
  });

  it("passa adiante no fim de cada rodada", () => {
    const game = started(3);
    expect(game.dealer!.id).toBe("p0");
    playRoundWith(game, {});
    expect(game.dealer!.id).toBe("p1");
    playRoundWith(game, {});
    expect(game.dealer!.id).toBe("p2");
  });

  it("quem saiu na vaza anterior começa a próxima", () => {
    const game = started(3);
    playRoundWith(game, {}); // rodada 1: uma carta
    // Rodada 2, duas cartas. p2 é o dealer; p0 abre.
    for (const player of game.active) player.hand = [];
    game.players.find((p) => p.id === "p0")!.hand = [card("spades", "5"), card("spades", "6")];
    game.players.find((p) => p.id === "p1")!.hand = [card("clubs", "4"), card("spades", "7")];
    game.players.find((p) => p.id === "p2")!.hand = [card("spades", "8"), card("spades", "9")];
    while (game.stage === "making_promises") {
      const turn = game.currentPlayer!;
      game.makePromise(turn.id, game.promiseOptions(turn.id)[0]);
    }
    const first = game.currentPlayer!.id;
    game.playCard(first, game.currentPlayer!.hand[0].id);
    while (game.currentPlayer) game.playCard(game.currentPlayer.id, game.currentPlayer.hand[0].id);

    // p1 baixou o 4 de paus: a vaza é dele, e a próxima sai dele.
    expect(game.lastTrickWinnerId).toBe("p1");
    game.resume();
    expect(game.currentPlayer!.id).toBe("p1");
    expect(game.trickNumber).toBe(2);
  });
});

/* --------------------------------------------------------------- promessas */

describe("as promessas", () => {
  it("aceita zero e aceita o máximo", () => {
    const game = started(3);
    expect(game.cardsPerPlayer).toBe(1);
    game.makePromise("p1", 0);
    expect(game.players.find((p) => p.id === "p1")!.promise).toBe(0);
    game.makePromise("p2", 1);
    expect(game.players.find((p) => p.id === "p2")!.promise).toBe(1);
  });

  it("recusa promessa negativa", () => {
    const game = started(3);
    expect(() => game.makePromise("p1", -1)).toThrow(/negativa/);
  });

  it("recusa promessa maior que a mão", () => {
    const game = started(3);
    expect(() => game.makePromise("p1", 2)).toThrow(/não pode passar de 1/);
  });

  it("recusa promessa fora da vez e fora da fase", () => {
    const game = started(3);
    expect(() => game.makePromise("p2", 0)).toThrow(/Não é a sua vez/);
    game.makePromise("p1", 0);
    game.makePromise("p2", 1);
    game.makePromise("p0", 1);
    expect(game.stage).toBe("playing_trick");
    expect(() => game.makePromise("p0", 0)).toThrow(/Não é hora de prometer/);
  });

  it("não deixa o último fechar a soma no número de cartas", () => {
    // Quatro jogadores, cinco cartas cada, e as três primeiras somando 4.
    const game = fiveCardTable();
    game.makePromise("p1", 2);
    game.makePromise("p2", 1);
    game.makePromise("p3", 1);

    expect(game.currentPlayer!.id).toBe("p0");
    expect(game.promised).toBe(4);
    expect(game.promiseOptions("p0")).toEqual([0, 2, 3, 4, 5]);
    expect(() => game.makePromise("p0", 1)).toThrow(/não pode dar 5/);
    game.makePromise("p0", 3);
    expect(game.stage).toBe("playing_trick");
  });

  it("obriga o último a uma promessa quando só sobra uma", () => {
    // Três jogadores, uma carta cada: 0 e 1 já declarados somam 1.
    const game = started(3);
    game.makePromise("p1", 0);
    game.makePromise("p2", 1);

    expect(game.promiseOptions("p0")).toEqual([1]);
    expect(() => game.makePromise("p0", 0)).toThrow(/não pode dar 1/);
    game.makePromise("p0", 1);
    expect(game.players.find((p) => p.id === "p0")!.promise).toBe(1);
  });

  it("a proibição é só do último: os outros escolhem o que quiserem", () => {
    const game = fiveCardTable();
    expect(game.promiseOptions("p1")).toEqual([0, 1, 2, 3, 4, 5]);
    game.makePromise("p1", 5);
    expect(game.promiseOptions("p2")).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("a conta da proibição vale sozinha, fora do jogo", () => {
    expect(forbiddenPromise(4, 5)).toBe(1);
    expect(forbiddenPromise(1, 1)).toBe(0);
    // Já passou do número de cartas: nada mais pode fechar a soma.
    expect(forbiddenPromise(7, 5)).toBe(null);
    expect(allowedPromises(5, 4, true)).toEqual([0, 2, 3, 4, 5]);
    expect(allowedPromises(5, 4, false)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

/** Uma mesa de 4 chegando à rodada de 5 cartas, com p0 de dealer. */
function fiveCardTable() {
  const game = started(4);
  for (let round = 1; round < 5; round++) playRoundWith(game, {});
  expect(game.cardsPerPlayer).toBe(5);
  // O dealer andou quatro casas numa mesa de quatro: voltou a ser p0.
  expect(game.dealer!.id).toBe("p0");
  return game;
}

/* --------------------------------------------------- a rodada às cegas */

describe("as rodadas de uma carta", () => {
  it("dá uma carta a cada um e não deixa ninguém ver a própria", () => {
    const game = started(3);
    expect(game.blind).toBe(true);

    const visible = game.visibleHand("p1");
    expect(visible.cards).toEqual([]);
    expect(visible.hiddenIds).toHaveLength(1);
    // O id não conta nada: o naipe e o valor não saem daqui.
    expect(visible.hiddenIds[0]).toBe(game.players.find((p) => p.id === "p1")!.hand[0].id);
  });

  it("mostra a mão dos adversários, e só a deles", () => {
    const game = started(3);
    const peek = game.peekedHands("p1");

    expect(peek.map((seat) => seat.playerId).sort()).toEqual(["p0", "p2"]);
    for (const seat of peek) expect(seat.cards).toHaveLength(1);
    expect(peek.some((seat) => seat.playerId === "p1")).toBe(false);
  });

  it("continua valendo a regra da soma", () => {
    const game = started(3);
    game.makePromise("p1", 0);
    game.makePromise("p2", 1);
    expect(game.promiseOptions("p0")).toEqual([1]);
  });

  it("deixa de ser às cegas assim que a mão cresce", () => {
    const game = started(3);
    playRoundWith(game, {});
    expect(game.round).toBe(2);
    expect(game.cardsPerPlayer).toBe(2);
    expect(game.blind).toBe(false);
    expect(game.visibleHand("p1").cards).toHaveLength(2);
    expect(game.peekedHands("p1")).toEqual([]);
  });

  /*
   * Às cegas não é privilégio da primeira rodada: é do TAMANHO da mão. Quando o
   * ciclo estoura o baralho e volta para uma carta, a rodada volta a ser cega —
   * com a carta à vista não haveria decisão nenhuma na promessa.
   */
  it("volta a ser às cegas quando o ciclo recomeça do 1", () => {
    const game = started(10); // máximo: 5 cartas por jogador
    const cegas: boolean[] = [];
    for (let round = 0; round < 7; round++) {
      cegas.push(game.blind);
      expect(game.blind).toBe(game.cardsPerPlayer === 1);
      playRoundWith(game, {});
    }
    // 1, 2, 3, 4, 5, 1, 2 cartas — a sexta rodada é cega de novo.
    expect(cegas).toEqual([true, false, false, false, false, true, false]);
  });
});

/* -------------------------------------------------------------- hierarquia */

describe("a hierarquia das cartas", () => {
  it("ordena os valores comuns do 4 ao 3", () => {
    const ordem = ["4", "5", "6", "7", "8", "9", "10", "q", "j", "k", "a", "2", "3"] as const;
    for (let i = 1; i < ordem.length; i++) {
      // Espadas, para não esbarrar no A♠; o 7 e o 4 comuns aqui são de espadas.
      // O A♠ é especial e sai desta escada: ele é conferido logo abaixo.
      if (ordem[i] === "a" || ordem[i - 1] === "a") continue;
      expect(cardPower(card("spades", ordem[i - 1]))).toBeLessThan(
        cardPower(card("spades", ordem[i])),
      );
    }
    expect(cardPower(card("spades", "k"))).toBeLessThan(cardPower(card("hearts", "a")));
    expect(cardPower(card("hearts", "a"))).toBeLessThan(cardPower(card("spades", "2")));
  });

  it("põe as cinco especiais no topo, na ordem certa", () => {
    const escada = [
      card("spades", "3"),
      card("joker", "black"),
      card("diamonds", "7"),
      card("spades", "a"),
      card("hearts", "7"),
      card("clubs", "4"),
    ];
    for (let i = 1; i < escada.length; i++) {
      expect(cardPower(escada[i - 1])).toBeLessThan(cardPower(escada[i]));
    }
  });

  it("não confunde as especiais com as comuns do mesmo valor", () => {
    // O 4 de paus é a carta mais forte; os outros quatros, as mais fracas.
    expect(cardPower(card("spades", "4"))).toBeLessThan(cardPower(card("clubs", "4")));
    expect(cardPower(card("clubs", "4"))).toBeGreaterThan(cardPower(card("hearts", "7")));
    // Sietes: só ouros e copas são especiais. Os outros dois se separam pelo
    // naipe, e não empatam.
    expect(cardPower(card("spades", "7"))).toBeLessThan(cardPower(card("clubs", "7")));
    expect(cardPower(card("clubs", "7"))).toBeLessThan(cardPower(card("diamonds", "7")));
    // Ases: só o de espadas.
    expect(cardPower(card("hearts", "a"))).toBeLessThan(cardPower(card("clubs", "a")));
    expect(cardPower(card("hearts", "a"))).toBeLessThan(cardPower(card("spades", "a")));
    // As duas tintas do coringa valem o mesmo — e é justamente por isso que o
    // baralho leva uma só delas.
    expect(cardPower(card("joker", "red"))).toBe(cardPower(card("joker", "black")));
  });

  /*
   * Duas cartas do mesmo valor não têm a mesma força: o naipe as separa, na
   * ordem do truco — ♦ < ♠ < ♥ < ♣. É o que faz a hierarquia ser uma ordem
   * TOTAL, sem empate nenhum a resolver.
   */
  it("desempata pelo naipe: ouros < espadas < copas < paus", () => {
    const escada = SUIT_LADDER.map((suit) => card(suit, "5"));
    for (let i = 1; i < escada.length; i++) {
      expect(cardPower(escada[i - 1])).toBeLessThan(cardPower(escada[i]));
    }
    // E o naipe nunca alcança o degrau do valor seguinte.
    expect(cardPower(card("clubs", "5"))).toBeLessThan(cardPower(card("diamonds", "6")));
    // Duas cartas quaisquer do baralho têm forças diferentes.
    const powers = createDeck().map(cardPower);
    expect(new Set(powers).size).toBe(powers.length);
  });

  it("dá a vaza ao naipe mais forte quando os valores empatam", () => {
    const { game, order } = openTrick(3);
    order[0].hand = [card("hearts", "5")];
    order[1].hand = [card("clubs", "5")];
    order[2].hand = [card("diamonds", "5")];

    playAll(game);
    expect(game.lastTrickWinnerId).toBe(order[1].id);
  });

  it("dá a vaza para a carta mais forte, não para a última", () => {
    const game = started(3);
    while (game.stage === "making_promises") {
      const turn = game.currentPlayer!;
      game.makePromise(turn.id, game.promiseOptions(turn.id)[0]);
    }
    game.players.find((p) => p.id === "p0")!.hand = [card("clubs", "4")];
    game.players.find((p) => p.id === "p1")!.hand = [card("hearts", "7")];
    game.players.find((p) => p.id === "p2")!.hand = [card("spades", "a")];

    while (game.currentPlayer) game.playCard(game.currentPlayer.id, game.currentPlayer.hand[0].id);

    expect(game.lastTrickWinnerId).toBe("p0");
    expect(game.players.find((p) => p.id === "p0")!.tricks).toBe(1);
  });
});

/* -------------------------------------------------------------- pontuação */

describe("a pontuação", () => {
  it("é a diferença absoluta, e só desce", () => {
    expect(pointsLost(3, 3)).toBe(0);
    expect(pointsLost(3, 5)).toBe(2);
    expect(pointsLost(3, 1)).toBe(2);
    expect(pointsLost(3, 2)).toBe(1);
    expect(pointsLost(3, 0)).toBe(3);
    expect(pointsLost(0, 0)).toBe(0);
  });

  it("desconta de quem errou e não tira nada de quem acertou", () => {
    const game = started(3);
    // Uma carta cada: p1 promete 0, p2 promete 1, e p0 é obrigado a 1.
    playRound(
      game,
      {
        p0: [card("spades", "5")],
        p1: [card("spades", "6")],
        p2: [card("clubs", "4")],
      },
      { p1: 0, p2: 1, p0: 1 },
    );

    expect(game.stage).toBe("round_result");
    const byId = Object.fromEntries(game.results.map((r) => [r.playerId, r]));
    // p2 levou a vaza com o 4 de paus: prometeu 1, fez 1.
    expect(byId.p2).toMatchObject({ promise: 1, tricks: 1, lost: 0, points: 10 });
    expect(byId.p1).toMatchObject({ promise: 0, tricks: 0, lost: 0, points: 10 });
    // p0 prometeu 1 e não fez nenhuma.
    expect(byId.p0).toMatchObject({ promise: 1, tricks: 0, lost: 1, points: 9 });
  });

  it("o total de vazas fecha com o número de cartas da mão", () => {
    const game = started(4);
    for (let round = 0; round < 4; round++) {
      const cards = game.cardsPerPlayer;
      const results = playRoundWith(game, {});
      const feitas = results.reduce((total, r) => total + r.tricks, 0);
      expect(feitas).toBe(cards);
    }
  });
});

/* -------------------------------------------------------------- eliminação */

describe("a eliminação", () => {
  it("tira da mesa quem chega exatamente a zero", () => {
    const game = started(3);
    game.players.find((p) => p.id === "p0")!.points = 1;

    playRound(
      game,
      {
        p0: [card("spades", "5")],
        p1: [card("spades", "6")],
        p2: [card("clubs", "4")],
      },
      { p1: 0, p2: 1, p0: 1 },
    );
    expect(game.results.find((r) => r.playerId === "p0")).toMatchObject({
      lost: 1,
      points: 0,
      eliminated: true,
    });

    game.resume(); // placar -> eliminação
    expect(game.players.find((p) => p.id === "p0")!.eliminated).toBe(true);
    expect(game.stage).toBe("player_elimination");
    expect(game.active.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  /*
   * Quem saiu não joga mais, e por isso pode ver: a mão fechada só existia
   * contra a mão dele. É o que deixa a mesa continuar interessante para quem
   * ficou olhando — e é a mesma tubulação da rodada às cegas.
   */
  it("abre a mão de quem ficou para quem já saiu da mesa", () => {
    const game = started(3);
    game.players.find((p) => p.id === "p0")!.points = 1;

    playRound(
      game,
      {
        p0: [card("spades", "5")],
        p1: [card("spades", "6")],
        p2: [card("clubs", "4")],
      },
      { p1: 0, p2: 1, p0: 1 },
    );
    game.resume(); // placar -> eliminação
    game.resume(); // eliminação -> rodada seguinte
    expect(game.players.find((p) => p.id === "p0")!.eliminated).toBe(true);
    expect(game.blind).toBe(false);

    const peek = game.peekedHands("p0");
    expect(peek.map((seat) => seat.playerId).sort()).toEqual(["p1", "p2"]);
    for (const seat of peek) expect(seat.cards).toHaveLength(game.cardsPerPlayer);

    // E para quem continua jogando nada mudou: a mão dos outros segue fechada.
    expect(game.peekedHands("p1")).toEqual([]);
  });

  it("nunca deixa a pontuação ficar negativa", () => {
    const game = started(4);
    playRoundWith(game, {}); // rodada 1
    // Rodada 2: duas cartas. Um ponto na mão e uma promessa de 2 sem fazer nenhuma.
    const alvo = game.active.find((p) => p.id !== game.dealer!.id)!;
    alvo.points = 1;

    for (const player of game.active) player.hand = [card("spades", "5"), card("spades", "6")];
    alvo.hand = [card("spades", "4"), card("hearts", "4")];
    game.players.find((p) => p.id === game.dealer!.id)!.hand = [
      card("clubs", "4"),
      card("hearts", "7"),
    ];

    while (game.stage === "making_promises") {
      const turn = game.currentPlayer!;
      const options = game.promiseOptions(turn.id);
      game.makePromise(turn.id, turn.id === alvo.id ? 2 : options[0]);
    }
    while (game.stage === "playing_trick") {
      if (game.pending) {
        game.resume();
        continue;
      }
      const turn = game.currentPlayer!;
      game.playCard(turn.id, turn.hand[0].id);
    }

    const result = game.results.find((r) => r.playerId === alvo.id)!;
    expect(result.tricks).toBe(0);
    expect(result.lost).toBe(2); // devia tirar 2 de 1 ponto
    expect(result.points).toBe(0); // e não -1
    expect(alvo.points).toBe(0);
  });

  it("não deixa quem foi eliminado jogar nem prometer", () => {
    const game = started(3);
    game.players.find((p) => p.id === "p0")!.points = 1;
    playRound(
      game,
      {
        p0: [card("spades", "5")],
        p1: [card("spades", "6")],
        p2: [card("clubs", "4")],
      },
      { p1: 0, p2: 1, p0: 1 },
    );
    game.resume(); // eliminação
    game.resume(); // rodada seguinte

    expect(game.stage).toBe("making_promises");
    expect(game.active.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(() => game.makePromise("p0", 0)).toThrow(/Não é a sua vez/);
    expect(game.playableCards("p0")).toEqual([]);
    expect(game.promiseOptions("p0")).toEqual([]);
    expect(game.players.find((p) => p.id === "p0")!.hand).toEqual([]);
  });

  it("declara vencedor o último de pé", () => {
    const game = started(2);
    game.players.find((p) => p.id === "p1")!.points = 1;

    playRound(
      game,
      { p0: [card("clubs", "4")], p1: [card("spades", "5")] },
      { p1: 1, p0: 1 },
    );
    game.resume();

    expect(game.stage).toBe("game_over");
    expect(game.phase).toBe("finished");
    expect(game.winnerId).toBe("p0");
  });

  /*
   * A rodada que zera a mesa inteira de uma vez. Zero é zero para todos, então
   * quem decide é o quanto cada um passou DO zero: vence quem parou mais perto
   * dele — quem aguentaria mais uma rodada se a partida continuasse.
   *
   * Precisa de uma mão de DUAS cartas: com uma só, os dois não têm como errar
   * juntos (um faz a vaza, o outro não, e a regra da soma proíbe justamente a
   * combinação de promessas em que os dois erram).
   */
  it("no zero geral, quem passou menos do zero vence", () => {
    const { game, first, second } = twoCardShowdown();
    // O primeiro promete 2 e não faz nenhuma: erra por 2, com 1 ponto na mão.
    first.points = 1;
    first.hand = [card("spades", "4"), card("spades", "5")];
    // O segundo promete 1 e faz as 2: erra por 1, também com 1 ponto na mão.
    second.points = 1;
    second.hand = [card("clubs", "4"), card("hearts", "7")];

    bid(game, { [first.id]: 2, [second.id]: 1 });
    playAll(game);

    expect(game.results.every((result) => result.eliminated)).toBe(true);
    expect(first.overshoot).toBe(-1); // 1 - 2
    expect(second.overshoot).toBe(0); // 1 - 1, exato

    game.resume();
    expect(game.stage).toBe("game_over");
    expect(game.winnerId).toBe(second.id);
    expect(game.winnerIds).toEqual([second.id]);
  });

  it("no empate perfeito do zero, ninguém vence sozinho", () => {
    const { game, first, second } = twoCardShowdown();
    // Cada um leva uma vaza tendo prometido duas: os dois erram por 1.
    first.points = 1;
    first.hand = [card("clubs", "4"), card("spades", "4")];
    second.points = 1;
    second.hand = [card("spades", "5"), card("hearts", "7")];

    bid(game, { [first.id]: 2, [second.id]: 2 });
    playAll(game);

    expect(first.overshoot).toBe(0);
    expect(second.overshoot).toBe(0);

    game.resume();
    expect(game.stage).toBe("game_over");
    // Mesmo saldo, nenhum critério para separá-los: é empate, e a cadeira em
    // que cada um sentou não desempata nada.
    expect(game.winnerId).toBe("");
    expect(game.winnerIds).toEqual([first.id, second.id]);
  });

  it("não começa outra rodada depois de sobrar um só", () => {
    const game = started(2);
    game.players.find((p) => p.id === "p1")!.points = 1;
    playRound(
      game,
      { p0: [card("clubs", "4")], p1: [card("spades", "5")] },
      { p1: 1, p0: 1 },
    );
    game.resume();

    expect(game.pending).toBe(null);
    game.resume();
    expect(game.stage).toBe("game_over");
    expect(game.round).toBe(1);
    expect(() => game.playCard("p0", "spades-5")).toThrow(/Não é hora de jogar/);
  });
});

/* ------------------------------------------------------ a máquina de estados */

describe("a máquina de estados", () => {
  it("recusa a carta na fase de promessas e a promessa na fase de carta", () => {
    const game = started(3);
    expect(game.stage).toBe("making_promises");
    expect(() => game.playCard("p1", game.players[1].hand[0].id)).toThrow(/Não é hora de jogar/);

    while (game.stage === "making_promises") {
      const turn = game.currentPlayer!;
      game.makePromise(turn.id, game.promiseOptions(turn.id)[0]);
    }
    expect(game.stage).toBe("playing_trick");
    expect(() => game.makePromise(game.currentPlayer!.id, 0)).toThrow(/Não é hora de prometer/);
  });

  it("não deixa jogar duas cartas na mesma vaza", () => {
    const game = started(3);
    while (game.stage === "making_promises") {
      const turn = game.currentPlayer!;
      game.makePromise(turn.id, game.promiseOptions(turn.id)[0]);
    }
    const first = game.currentPlayer!;
    game.playCard(first.id, first.hand[0].id);
    expect(() => game.playCard(first.id, "seja-la-o-que-for")).toThrow(/Não é a sua vez/);
  });

  it("recusa a carta que não está na mão de quem jogou", () => {
    const game = started(3);
    while (game.stage === "making_promises") {
      const turn = game.currentPlayer!;
      game.makePromise(turn.id, game.promiseOptions(turn.id)[0]);
    }
    const turn = game.currentPlayer!;
    const alheia = game.players.find((p) => p.id !== turn.id)!.hand[0];
    expect(() => game.playCard(turn.id, alheia.id)).toThrow(/Você não tem essa carta/);
  });

  it("segura a vaza fechada na mesa até o relógio deixar", () => {
    const game = started(3);
    while (game.stage === "making_promises") {
      const turn = game.currentPlayer!;
      game.makePromise(turn.id, game.promiseOptions(turn.id)[0]);
    }
    while (game.currentPlayer) game.playCard(game.currentPlayer.id, game.currentPlayer.hand[0].id);

    // A vaza está completa e ainda na mesa: ninguém tem a vez.
    expect(game.trick).toHaveLength(3);
    expect(game.currentPlayer).toBeUndefined();
    expect(game.pending).toMatchObject({ step: "trick" });

    game.resume();
    expect(game.trick).toEqual([]);
    expect(game.stage).toBe("round_result");
  });
});


/* ------------------------------------------------- as regras da casa */

describe("o cangar", () => {
  it("anula as cartas de valor repetido, e o resto decide", () => {
    const { game, order } = openTrick(3, { cangar: true });
    // Dois valetes se anulam; o 5 sobra sozinho e leva, mesmo sendo mais fraco.
    order[0].hand = [card("spades", "j")];
    order[1].hand = [card("hearts", "j")];
    order[2].hand = [card("diamonds", "5")];

    playAll(game);
    expect(game.lastTrickWinnerId).toBe(order[2].id);
  });

  it("anula a vaza inteira quando nada sobra", () => {
    const { game, order } = openTrick(5, { cangar: true });
    // Três valetes e dois dois: J J J / 2 2 — o exemplo da regra.
    order[0].hand = [card("spades", "j")];
    order[1].hand = [card("hearts", "j")];
    order[2].hand = [card("clubs", "j")];
    order[3].hand = [card("spades", "2")];
    order[4].hand = [card("hearts", "2")];

    playAll(game);

    expect(game.lastTrickWinnerId).toBe("");
    expect(game.active.every((player) => player.tricks === 0)).toBe(true);
  });

  it("não anula manilha: cada uma é única, e ela leva a vaza", () => {
    const { game, order } = openTrick(3, { cangar: true });
    // Dois sietes comuns se anulam; o 7♥ é manilha e continua valendo.
    order[0].hand = [card("spades", "7")];
    order[1].hand = [card("clubs", "7")];
    order[2].hand = [card("hearts", "7")];

    playAll(game);
    expect(game.lastTrickWinnerId).toBe(order[2].id);
  });

  it("deixa a vaza anulada com quem saiu nela", () => {
    const game = table(3);
    game.rules = { cangar: true, porcao: false };
    game.start("p0");
    playRoundWith(game, {}); // a rodada de uma carta
    expect(game.cardsPerPlayer).toBe(2);
    while (game.stage === "making_promises") {
      const turn = game.currentPlayer!;
      game.makePromise(turn.id, game.promiseOptions(turn.id)[0]);
    }

    const saiu = game.currentPlayer!;
    for (const player of game.active) player.hand = [card("spades", "j"), card("spades", "5")];
    game.active[1].hand = [card("hearts", "j"), card("hearts", "5")];
    game.active[2].hand = [card("clubs", "j"), card("clubs", "5")];
    // Reescreve a mão de quem sai para o valete dele também.
    saiu.hand = [card("diamonds", "j"), card("diamonds", "5")];

    while (game.currentPlayer) game.playCard(game.currentPlayer.id, game.currentPlayer.hand[0].id);
    expect(game.lastTrickWinnerId).toBe("");

    game.resume();
    // A vaza não aconteceu para ninguém, inclusive para a ordem.
    expect(game.currentPlayer!.id).toBe(saiu.id);
    expect(game.trickNumber).toBe(2);
  });

  it("desligado, cartas de valor igual continuam se separando pelo naipe", () => {
    const { game, order } = openTrick(3);
    order[0].hand = [card("spades", "j")];
    order[1].hand = [card("hearts", "j")];
    order[2].hand = [card("diamonds", "5")];

    playAll(game);
    expect(game.lastTrickWinnerId).toBe(order[1].id);
  });
});

describe("o porcão", () => {
  it("mata o zap e leva a vaza, mesmo com outra manilha na mesa", () => {
    const { game, order } = openTrick(3, { porcao: true });
    order[0].hand = [card("spades", "4")]; // porcão
    order[1].hand = [card("clubs", "4")]; // zap
    order[2].hand = [card("hearts", "7")];

    playAll(game);
    expect(game.lastTrickWinnerId).toBe(order[0].id);
  });

  it("sem o zap na mesa, é a carta mais fraca do baralho", () => {
    const { game, order } = openTrick(2, { porcao: true });
    order[0].hand = [card("spades", "4")]; // porcão
    order[1].hand = [card("diamonds", "4")]; // a menor carta comum

    playAll(game);
    expect(game.lastTrickWinnerId).toBe(order[1].id);
  });

  it("não mata mais nada: só o zap", () => {
    const { game, order } = openTrick(2, { porcao: true });
    order[0].hand = [card("spades", "4")];
    order[1].hand = [card("hearts", "7")]; // manilha, sem zap na mesa

    playAll(game);
    expect(game.lastTrickWinnerId).toBe(order[1].id);
  });

  it("desligado, o 4♠ é um quatro comum e perde para o zap", () => {
    const { game, order } = openTrick(2);
    order[0].hand = [card("spades", "4")];
    order[1].hand = [card("clubs", "4")];

    playAll(game);
    expect(game.lastTrickWinnerId).toBe(order[1].id);
  });

  it("armado, o porcão não se anula com outro quatro no cangar", () => {
    const { game, order } = openTrick(3, { cangar: true, porcao: true });
    order[0].hand = [card("spades", "4")]; // porcão
    order[1].hand = [card("hearts", "4")]; // quatro comum
    order[2].hand = [card("clubs", "4")]; // zap

    playAll(game);
    // O zap arma o porcão, e ele deixa de ser um quatro comum: quem se anula é
    // o 4♥, sozinho, o que não anula nada. O porcão leva.
    expect(game.lastTrickWinnerId).toBe(order[0].id);
  });

  it("desarmado, o porcão se anula como qualquer quatro no cangar", () => {
    const { game, order } = openTrick(3, { cangar: true, porcao: true });
    order[0].hand = [card("spades", "4")]; // porcão, sem zap na mesa
    order[1].hand = [card("hearts", "4")];
    order[2].hand = [card("diamonds", "5")];

    playAll(game);
    expect(game.lastTrickWinnerId).toBe(order[2].id);
  });
});

describe("a mesa sem regra opcional nenhuma", () => {
  it("nasce com as duas desligadas", () => {
    const game = table(2);
    expect(game.rules).toEqual({ cangar: false, porcao: false });
  });
});
