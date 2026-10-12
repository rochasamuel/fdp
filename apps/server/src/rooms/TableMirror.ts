import { MAX_PLAYERS } from "@fdp/shared";
import type { GamePlayer, TableGame } from "../game/TableGame.js";
import { CardState, PlayerState, RoundResultState, type TableRoomState } from "./TableState.js";

/**
 * Quantas cartas da vaza os clientes recebem. É o máximo de jogadores da mesa,
 * de propósito: no FDP a vaza tem uma carta de cada um, e cortar a janela
 * esconderia a carta de alguém justo na hora de conferir quem levou.
 */
const VISIBLE_CENTRE = MAX_PLAYERS;

/** O que só a sala sabe de cada cadeira — o motor não conhece conexão. */
export type SeatStatus = {
  connected: (id: string) => boolean;
  /** Segundos de cadeira guardada que restam a quem caiu; `0` para os outros. */
  away: (player: GamePlayer) => number;
};

/**
 * O adaptador entre o motor e a rede: copia a metade pública do `TableGame`
 * para o `TableRoomState`, que é o que o Colyseus sincroniza.
 *
 * Ele existe à parte da sala porque é uma tarefa só, e uma tarefa de detalhe:
 * cada lista é escrita pela ponta que mudou, e não reescrita inteira, para que
 * uma jogada vire um patch de uma operação em vez de um da mesa toda.
 */
export class TableMirror {
  /** Até que linha do log a mesa já foi espelhada. Ver `writeLog`. */
  private sentLogSeq = 0;

  write(state: TableRoomState, game: TableGame, seats: SeatStatus) {
    state.phase = game.phase;
    state.currentPlayerId = game.phase === "playing" ? (game.currentPlayer?.id ?? "") : "";
    state.deckCount = game.deck.length;
    state.winnerId = game.winnerId;
    if (
      state.winnerIds.length !== game.winnerIds.length ||
      game.winnerIds.some((id, i) => state.winnerIds[i] !== id)
    ) {
      state.winnerIds.splice(0);
      state.winnerIds.push(...game.winnerIds);
    }

    state.stage = game.stage;
    state.round = game.round;
    state.cardsPerPlayer = game.cardsPerPlayer;
    state.dealerId = game.dealer?.id ?? "";
    state.trickNumber = game.trickNumber;
    state.blind = game.blind && game.phase === "playing";
    state.promised = game.promised;
    state.lastTrickWinnerId = game.lastTrickWinnerId;

    this.writePlayers(state, game, seats);
    this.writeResults(state, game);
    this.writeCentre(state, game);
    this.writeLog(state, game);
  }

  writePlayers(state: TableRoomState, game: TableGame, seats: SeatStatus) {
    const rosterChanged =
      state.players.length !== game.players.length ||
      game.players.some((player, i) => state.players[i]?.id !== player.id);

    if (rosterChanged) {
      state.players.splice(0);
      for (const player of game.players) {
        const entry = new PlayerState();
        entry.id = player.id;
        entry.name = player.name;
        state.players.push(entry);
      }
    }

    game.players.forEach((player, i) => {
      const entry = state.players[i];
      entry.connected = seats.connected(player.id);
      entry.points = player.points;
      entry.overshoot = player.overshoot;
      // `-1` é "ainda não declarou". A promessa é pública desde que sai da
      // boca de quem a fez: o jogo é justamente sobre atrapalhar a dos outros.
      entry.promise = player.promise ?? -1;
      entry.tricks = player.tricks;
      entry.eliminated = player.eliminated;
      entry.away = seats.away(player);
    });
  }

  /**
   * O placar da rodada. Ele nasce inteiro e morre inteiro — não é uma janela
   * que anda como o log —, então reescrevê-lo só quando ele MUDA de tamanho ou
   * de conteúdo já basta, e fora do `round_result` ele é uma lista vazia.
   */
  private writeResults(state: TableRoomState, game: TableGame) {
    const { results } = game;
    const mirrored = state.results;
    if (mirrored.length === results.length) {
      const same = results.every(
        (result, i) =>
          mirrored[i].playerId === result.playerId &&
          mirrored[i].lost === result.lost &&
          mirrored[i].points === result.points,
      );
      if (same) return;
    }
    mirrored.splice(0);
    for (const result of results) mirrored.push(RoundResultState.from(result));
  }

  /**
   * A ponta visível do centro, escrita pelo fim.
   *
   * O caso comum é uma carta a mais no topo. Reescrever as oito para anunciar
   * uma custava oito objetos de esquema novos e um patch que apagava e
   * recriava a lista inteira — a cada jogada, para a mesa toda. Aqui entra o
   * que entrou e sai da frente o que saiu da janela.
   */
  private writeCentre(state: TableRoomState, game: TableGame) {
    const centre = game.trick;
    const grew = centre.length - state.centreCount;
    /*
     * Mesma altura E mesmo topo é a mesma pilha. Só a altura não bastava: uma
     * revanche começa do zero, que é exatamente onde certas partidas terminam
     * — e a mesa continuava mostrando a carta da anterior, porque o número não
     * tinha mexido.
     */
    if (grew === 0 && state.centre.at(-1)?.id === centre.at(-1)?.card.id) return;

    state.centreCount = centre.length;
    const visible = Math.min(VISIBLE_CENTRE, centre.length);

    if (grew > 0 && grew < visible) {
      for (const play of centre.slice(-grew)) {
        state.centre.push(CardState.from(play.card, play.playerId));
      }
      while (state.centre.length > visible) state.centre.shift();
      return;
    }

    state.centre.splice(0);
    for (const play of centre.slice(-visible)) {
      state.centre.push(CardState.from(play.card, play.playerId));
    }
  }

  /**
   * O log, pelo mesmo motivo e do mesmo jeito: ele é uma janela que anda, e
   * anunciar uma linha nova reescrevendo as doze mandava doze operações no
   * patch para dizer uma. `logSeq` é o que diz quantas são novas — sem ele não
   * dava para saber, porque duas linhas podem ter o mesmo texto.
   *
   * Uma partida nova zera o contador, e aí a janela inteira é outra.
   */
  private writeLog(state: TableRoomState, game: TableGame) {
    const { log, logSeq } = game;
    const fresh = logSeq - this.sentLogSeq;
    this.sentLogSeq = logSeq;

    // Pelo mesmo cuidado do centro: o contador zerado de uma partida nova pode
    // cair exatamente onde o da anterior parou.
    const mirrored = state.log;
    if (fresh === 0 && mirrored.length === log.length && mirrored.at(-1) === log.at(-1)) {
      return;
    }
    if (fresh > 0 && fresh < log.length) {
      const dropped = mirrored.length + fresh - log.length;
      for (let i = 0; i < dropped; i++) mirrored.shift();
      for (const message of log.slice(-fresh)) mirrored.push(message);
      return;
    }

    mirrored.splice(0);
    mirrored.push(...log);
  }
}
