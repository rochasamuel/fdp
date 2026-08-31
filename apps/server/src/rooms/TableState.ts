import { ArraySchema, Schema, type } from "@colyseus/schema";
import {
  DEFAULT_MAX_PLAYERS,
  type Card,
  type GamePhase,
  type MatchStage,
  type RoundResult,
} from "@fdp/shared";

/**
 * Tudo aqui é público: vai para todos os clientes da sala. As mãos estão
 * deliberadamente de fora — elas vão só para o dono, numa mensagem `hand`.
 *
 * O formato espelhado em `TableState`, no `@fdp/shared`, é o mesmo. Campo novo
 * é campo nos dois.
 */

export class CardState extends Schema {
  @type("string") id = "";
  @type("string") suit = "";
  @type("string") rank = "";
  /** Quem baixou esta carta na vaza. É o que deixa a mesa dizer de quem é. */
  @type("string") owner = "";

  static from(card: Card, owner = ""): CardState {
    const state = new CardState();
    state.id = card.id;
    state.suit = card.suit;
    state.rank = card.rank;
    state.owner = owner;
    return state;
  }
}

/** O que um jogador prometeu e o que fez, no placar do fim da rodada. */
export class RoundResultState extends Schema {
  @type("string") playerId = "";
  @type("uint8") promise = 0;
  @type("uint8") tricks = 0;
  @type("uint8") lost = 0;
  @type("uint8") points = 0;
  /** Os mesmos pontos sem o piso do zero — negativo quando passou. */
  @type("int8") overshoot = 0;
  @type("boolean") eliminated = false;

  static from(result: RoundResult): RoundResultState {
    const state = new RoundResultState();
    state.playerId = result.playerId;
    state.promise = result.promise;
    state.tricks = result.tricks;
    state.lost = result.lost;
    state.points = result.points;
    state.overshoot = result.overshoot;
    state.eliminated = result.eliminated;
    return state;
  }
}

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("boolean") connected = true;
  /** O que resta dos dez. Zero é a porta da rua. */
  @type("uint8") points = 0;
  /**
   * O que restaria sem o piso do zero. Só difere de `points` em quem foi
   * eliminado passando do zero, e é o que separa dois "zero" no fim.
   */
  @type("int8") overshoot = 0;
  /** Quantas vazas ele prometeu; `-1` enquanto não declarou — daí o `int8`. */
  @type("int8") promise = -1;
  @type("uint8") tricks = 0;
  @type("boolean") eliminated = false;
}

export class TableRoomState extends Schema {
  @type("string") roomName = "";
  @type("string") hostId = "";
  @type("string") phase: GamePhase = "lobby";
  @type("uint8") maxPlayers = DEFAULT_MAX_PLAYERS;
  @type([PlayerState]) players = new ArraySchema<PlayerState>();

  @type("string") currentPlayerId = "";
  /**
   * O sorteado: o nome em que a roleta vai parar. Vale enquanto ela gira e é
   * apagado quando as cartas saem — vazio quer dizer que não há sorteio em
   * curso, e é só isso que a mesa precisa saber para mostrar ou esconder a
   * roleta. Quem começou a partida, depois dela, quem conta é o log.
   */
  @type("string") starterId = "";
  @type("uint16") deckCount = 0;
  /** O tamanho do centro inteiro; `centre` só carrega a ponta visível. */
  @type("uint16") centreCount = 0;
  /** A VAZA em disputa, na ordem em que as cartas foram baixadas. */
  @type([CardState]) centre = new ArraySchema<CardState>();
  /** O campeão. Vazio quando não há um: ninguém de pé, ou empate. */
  @type("string") winnerId = "";
  /** Quem venceu: um de costume, vários no empate, nenhum sem campeão. */
  @type(["string"]) winnerIds = new ArraySchema<string>();
  @type(["string"]) log = new ArraySchema<string>();

  /* --- a partida --------------------------------------------------------
   * A máquina de estados do FDP, espelhada para a tela. Ela não decide nada:
   * o servidor já recusou o que não cabia no estado antes de chegar aqui. O
   * que ela compra é a tela mostrar a pergunta certa — promessa, carta,
   * placar — sem ter de adivinhar por contadores.
   * -------------------------------------------------------------------- */
  @type("string") stage: MatchStage = "waiting_for_players";
  @type("uint16") round = 0;
  @type("uint8") cardsPerPlayer = 0;
  /** O teto de cartas por rodada combinado na criação; `0` é sem teto. */
  @type("uint8") maxCards = 0;
  @type("string") dealerId = "";
  @type("uint8") trickNumber = 0;
  /** A rodada às cegas: cada um vê a mão dos outros, e não a sua. */
  @type("boolean") blind = false;
  /** A soma das promessas já declaradas. */
  @type("uint8") promised = 0;
  @type("string") lastTrickWinnerId = "";
  /** O placar da rodada, enquanto ele está na tela. Vazio fora dele. */
  @type([RoundResultState]) results = new ArraySchema<RoundResultState>();

  /* --- as regras da casa -------------------------------------------------
   * Escolhidas na criação da mesa e fixas até o fim. Estão no estado público
   * porque elas mudam o que uma carta VALE, e quem está olhando a mesa precisa
   * saber disso antes de escolher o que baixar.
   * -------------------------------------------------------------------- */
  @type("boolean") cangar = false;
  @type("boolean") porcao = false;
}
