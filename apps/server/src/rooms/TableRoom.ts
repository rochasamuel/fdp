import { CloseCode, Room, type Client } from "colyseus";
import {
  DEFAULT_MAX_PLAYERS,
  EMOTE_COOLDOWN,
  isEmote,
  LOBBY_RECONNECT_TIMEOUT,
  MAX_CARDS_CAP,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RECONNECT_TIMEOUT,
  STARTER_SPIN,
  type CreateRoomOptions,
  type EmoteEvent,
  type EmoteMessage,
  type ErrorMessage,
  type FxMessage,
  type HandMessage,
  type JoinRoomOptions,
  type PlayMessage,
  type PromiseMessage,
} from "@fdp/shared";
import { GameError, TableGame, type GamePlayer } from "../game/TableGame.js";
import { CardState, PlayerState, RoundResultState, TableRoomState } from "./TableState.js";

/**
 * Quantas cartas da vaza os clientes recebem. É o máximo de jogadores da mesa,
 * de propósito: no FDP a vaza tem uma carta de cada um, e cortar a janela
 * esconderia a carta de alguém justo na hora de conferir quem levou.
 */
const VISIBLE_CENTRE = MAX_PLAYERS;

const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 5;
const LOBBY_CHANNEL = "$fdplobby";

/** O único fechamento que é uma saída de verdade: alguém apertou "sair". */
const CONSENTED = CloseCode.CONSENTED;

export class TableRoom extends Room<{ state: TableRoomState }> {
  state = new TableRoomState();

  private game = new TableGame();
  private connected = new Set<string>();
  /** A volta da roleta em curso. Enquanto existir, a mesa está sorteando. */
  private starterTimer?: { clear: () => void };
  /**
   * O relógio dos passos que o jogo não dá sozinho: a vaza fechada saindo da
   * mesa e o placar da rodada dando lugar à próxima. O motor diz o QUE está
   * pendente e por quanto tempo; quem conta o tempo é a sala, porque é ela que
   * tem relógio — e é isso que deixa o teste rodar a partida sem esperar.
   */
  private stepTimer?: { clear: () => void };
  /** Quando cada jogador falou pela última vez, para o intervalo entre emojis. */
  private lastEmote = new Map<string, number>();
  /** A última mão que cada cliente recebeu, para não reenviar a mesma. */
  private sentHands = new Map<string, string>();
  /** Até que linha do log a mesa já foi espelhada. Ver `syncLog`. */
  private sentLogSeq = 0;
  /**
   * Cadeiras guardadas agora, à espera de quem caiu. Existe para não guardar a
   * mesma cadeira duas vezes: o framework avisa a mesma queda por dois caminhos
   * (ver `onLeave`), e a segunda reserva seria um lugar que nunca morre.
   */
  private holding = new Set<string>();

  messages = {
    start: (client: Client) => this.act(client, () => this.draft(client)),

    /*
     * "Me conta de novo onde estamos."
     *
     * O celular congela a aba quando a tela apaga ou quem joga sai para mandar
     * o convite, e a mesa volta do congelamento exibindo o quadro em que
     * parou. Enquanto o socket sobreviveu não há nada que reescreva esse
     * quadro: o Colyseus só manda o que MUDOU, e o que mudou já passou. Este
     * pedido é o cliente dizendo que não confia mais no que tem na tela.
     */
    resync: (client: Client) => this.resync(client),

    play: (client: Client, message: PlayMessage) =>
      this.act(client, () => this.game.playCard(client.sessionId, message?.cardId)),

    /*
     * A promessa. Não existe "comprar" nem "passar" no FDP: quem tem carta
     * joga, e quem tem a vez de declarar declara. As duas mensagens que
     * existiam para isso saíram daqui — uma mensagem que o servidor aceita é
     * uma regra que o jogo tem.
     */
    promise: (client: Client, message: PromiseMessage) =>
      this.act(client, () => this.game.makePromise(client.sessionId, Number(message?.promise))),

    /**
     * A conversa da mesa. Não passa pelo `act` porque não é jogada: não muda
     * estado nenhum, não pode ser recusada com um aviso e não pede `sync` —
     * sai direto para todo mundo, inclusive de volta para quem falou, que é o
     * que confirma o envio na tela dele.
     *
     * Fora do intervalo o emoji é engolido em silêncio, e de propósito: quem
     * apertou rápido demais não cometeu erro nenhum, e um aviso vermelho por
     * isso seria mais barulhento que a mensagem que ele está impedindo.
     */
    emote: (client: Client, message: EmoteMessage) => {
      if (!isEmote(message?.emote)) return;
      const now = this.clock.currentTime;
      const last = this.lastEmote.get(client.sessionId) ?? -Infinity;
      if (now - last < EMOTE_COOLDOWN) return;
      this.lastEmote.set(client.sessionId, now);
      this.broadcast("emote", {
        by: client.sessionId,
        emote: message.emote,
      } satisfies EmoteEvent);
    },

    restart: (client: Client) =>
      this.act(client, () => {
        this.requireHost(client);
        if (this.game.phase !== "finished") {
          throw new GameError("A partida ainda está em andamento.");
        }
        // A revanche é uma partida nova, e uma partida nova se sorteia: o
        // vencedor não herda a saída.
        this.draft(client);
      }),
  };

  async onCreate(options: CreateRoomOptions) {
    this.roomId = await this.generateRoomId();
    this.state.roomName = sanitize(options?.roomName, "Mesa FDP", 40);
    this.state.maxPlayers = clamp(
      Number(options?.maxPlayers) || DEFAULT_MAX_PLAYERS,
      MIN_PLAYERS,
      MAX_PLAYERS,
    );
    this.maxClients = this.state.maxPlayers;

    // As regras da casa chegam com a criação e não mudam mais: trocá-las no
    // meio da partida seria mudar o que vale uma carta que já está na mão de
    // alguém. O motor nasce antes deste `onCreate` (ele é assíncrono), então
    // quem as escreve é ele, uma vez.
    this.game.rules = {
      cangar: options?.cangar === true,
      porcao: options?.porcao === true,
    };
    this.state.cangar = this.game.rules.cangar;
    this.state.porcao = this.game.rules.porcao;

    // O teto de cartas por rodada. Fora da faixa ou ausente vira 0, que é o
    // jogo como sempre foi: sobe até onde o baralho deixar.
    const cap = Math.round(Number(options?.maxCards));
    this.game.maxCards = cap >= 1 && cap <= MAX_CARDS_CAP ? cap : 0;
    this.state.maxCards = this.game.maxCards;
  }

  /**
   * A porta da sala. É AQUI que se decide quem entra, e não numa tranca no
   * matchmaking — uma sala trancada recusa antes de olhar quem está batendo, e
   * quem estava batendo era justamente quem tinha uma cadeira guardada lá
   * dentro. Ver `onDrop`.
   */
  onJoin(client: Client, options: JoinRoomOptions) {
    const seatKey = sanitize(options?.seatKey, "", 64);
    const seat = this.game.seatOf(seatKey);

    if (seat) {
      /*
       * Uma cadeira só se reclama vazia. Com o dono conectado, a chave não abre
       * nada: ela é uma credencial ao portador, e sem esta guarda uma cópia
       * dela derrubaria o dono da própria mesa.
       */
      if (this.connected.has(seat.id)) {
        throw new GameError("Você já está nesta mesa em outra aba.");
      }
      this.reseat(seat, client);
    } else {
      // O sorteio já rolando é uma partida que começou: quem entrasse agora
      // receberia cartas de uma roleta que já passou na tela dos outros.
      if (this.starterTimer) throw new GameError("A partida já começou.");
      this.game.addPlayer(client.sessionId, seatKey, sanitize(options?.playerName, "Jogador", 16));
      this.connected.add(client.sessionId);
    }

    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.sync();
  }

  /**
   * Devolve a cadeira a quem voltou por uma conexão nova.
   *
   * A sessão é outra, e o assento é o mesmo: a mão, o lugar na roda e a vez
   * continuam onde estavam. O que troca de dono é o `sessionId`, que é como a
   * mesa endereça as pessoas — daí ter de acompanhá-lo em toda parte que o
   * guarda.
   */
  private reseat(seat: GamePlayer, client: Client) {
    const previous = seat.id;
    this.game.reseat(seat, client.sessionId);
    // A reserva antiga ainda vai vencer lá na frente, e quando vencer não vai
    // achar cadeira nenhuma com aquele id — que é o certo. O que sai daqui é só
    // a marca, para ela não sobrar em memória pelo resto da partida.
    this.holding.delete(previous);
    this.connected.delete(previous);
    this.connected.add(client.sessionId);
    this.sentHands.delete(previous);
    this.lastEmote.delete(previous);
    if (this.state.hostId === previous) this.state.hostId = client.sessionId;
    if (this.state.starterId === previous) this.state.starterId = client.sessionId;
    if (this.game.winnerId === previous) this.game.winnerId = client.sessionId;
    this.game.winnerIds = this.game.winnerIds.map((id) =>
      id === previous ? client.sessionId : id,
    );
  }

  /**
   * A queda. A cadeira fica guardada por 90 segundos, e só então morre.
   *
   * Duas coisas a guardam, e são duas de propósito: o `allowReconnection` do
   * Colyseus, que devolve o lugar a quem voltar pelo token; e a `seatKey`, que
   * devolve o mesmo lugar a quem voltar sem ele — o token TROCA a cada
   * reconexão, e a aba que morre antes de guardar o novo volta com uma chave
   * morta na mão. Ver `onJoin`.
   */
  onDrop(client: Client) {
    this.hold(client);
  }

  onReconnect(client: Client) {
    /*
     * A aba velha acordou depois de a nova já ter reclamado a cadeira pela
     * chave. São duas conexões para uma pessoa só, e a cadeira é da nova: a
     * velha não tem lugar nesta mesa, e mantê-la aqui seria uma tela viva
     * mostrando uma mão que não é mais dela.
     */
    if (!this.seatOf(client)) {
      client.send("error", {
        message: "Você voltou para esta mesa em outra aba.",
      } satisfies ErrorMessage);
      client.leave();
      return;
    }
    this.holding.delete(client.sessionId);
    this.connected.add(client.sessionId);
    this.sync();
  }

  /**
   * A saída — e nem toda saída é saída.
   *
   * O Colyseus não manda toda queda para o `onDrop`: quem cai LOGO DEPOIS de
   * reconectar (o cliente ainda em `RECONNECTING`) e quem fecha a página
   * chegam por aqui, no mesmo caminho de quem apertou "voltar ao início".
   * Tratar os dois como saída era o que trancava o jogador do lado de fora:
   * a pessoa minimizava o navegador, o socket morria duas vezes, e a cadeira
   * que era para durar 90 segundos morria em três.
   *
   * Então a pergunta não é por onde a notícia chegou: é se ela foi CONSENTIDA.
   * Só o `4000` é uma saída de verdade; o resto é queda, e queda guarda lugar.
   */
  onLeave(client: Client, code: CloseCode) {
    if (code !== CONSENTED && !this.holding.has(client.sessionId) && this.seatOf(client)) {
      this.hold(client);
      return;
    }
    this.release(client);
  }

  onDispose() {
    return this.presence.srem(LOBBY_CHANNEL, this.roomId);
  }

  /* --------------------------------------------------------------- privado */

  /** A cadeira desta conexão, se ela ainda tiver uma. */
  private seatOf(client: Client) {
    return this.game.players.find((player) => player.id === client.sessionId);
  }

  /**
   * Guarda o lugar de quem caiu, e marca o fim do prazo.
   *
   * O `catch` é o que faz os 90 segundos serem 90 segundos: sem ele, quem
   * decidiria a hora de tirar a cadeira seria o `onLeave` que o framework
   * dispara depois — o mesmo que não sabe distinguir uma queda de uma saída.
   * Aqui a promessa é explícita: reconectou, fica; não reconectou, sai.
   */
  private hold(client: Client) {
    // Um cliente que nem chegou a sentar (o `onJoin` o recusou) não tem cadeira
    // a guardar, e pedir uma reserva para ele só rende um erro no log.
    if (!this.seatOf(client)) return;

    this.connected.delete(client.sessionId);
    // Quem volta pode ser uma página nova, de leque vazio: o que ele já recebeu
    // não vale mais como aposta.
    this.sentHands.delete(client.sessionId);
    this.holding.add(client.sessionId);
    this.sync();

    // Guardar o lugar é também o que mantém a sala viva: o Colyseus só descarta
    // uma sala sem clientes quando não há mais nenhuma reserva pendente.
    this.allowReconnection(
      client,
      this.game.phase === "playing" ? RECONNECT_TIMEOUT : LOBBY_RECONNECT_TIMEOUT,
    ).catch(() => {
      // O prazo venceu, ou a sala acabou: agora sim a cadeira é de mais ninguém.
      this.release(client);
    });
  }

  /** Tira a cadeira da mesa. Idempotente: o prazo e o framework podem chegar juntos. */
  private release(client: Client) {
    this.holding.delete(client.sessionId);
    this.connected.delete(client.sessionId);
    this.lastEmote.delete(client.sessionId);
    this.sentHands.delete(client.sessionId);
    this.game.removePlayer(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      this.state.hostId = this.game.players[0]?.id ?? "";
    }
    this.sync();
  }

  /** Roda uma ação, avisando quem pediu em vez de derrubar a sala. */
  private act(client: Client, action: () => void) {
    try {
      action();
    } catch (error) {
      if (error instanceof GameError) {
        client.send("error", { message: error.message } satisfies ErrorMessage);
        /*
         * Uma recusa é a única pista que o servidor tem de que a tela de quem
         * tentou pode estar contando outra história — e, sem isto, era uma
         * pista jogada fora: a mesa dele seguia igual, o toque seguinte era
         * recusado igual, e uma divergência que devia durar um quadro durava
         * a partida inteira.
         *
         * O estado não mudou, então isto não corrige o servidor: corrige o
         * cliente, que é onde a divergência mora.
         */
        this.resync(client);
        return;
      }
      throw error;
    }
    this.sync();
  }

  /**
   * Reescreve a mesa de UM cliente: o estado público inteiro e a mão dele.
   *
   * O estado inteiro, e não um remendo, porque o que se está consertando é
   * justamente não saber o que ele tem — o Colyseus manda diferenças, e uma
   * diferença sobre uma base errada continua errada.
   */
  private resync(client: Client) {
    /*
     * O mesmo caminho que o Colyseus percorre quando alguém entra ou reconecta,
     * só que sob demanda. É interno, daí a guarda: se uma versão futura mudar o
     * nome, a mão sozinha ainda conserta o leque — e é o leque que decide o que
     * a tela deixa tocar.
     */
    try {
      (this as unknown as { sendFullState(target: Client): void }).sendFullState(client);
    } catch {
      // segue só com a mão
    }
    this.sendHandTo(client, true);
  }

  /**
   * Sorteia quem começa e agenda a partida para quando a roleta parar.
   *
   * O sorteado é publicado ANTES de as cartas saírem: é ele que a roleta gira
   * até encontrar, e é o servidor quem conta o tempo da volta. Fosse cada
   * cliente a sortear a sua, cada mesa veria um vencedor diferente; fosse cada
   * cliente a contar o tempo, o reparto chegaria em cima de uma roleta ainda
   * girando na tela de quem tem a aba mais lenta.
   */
  private draft(client: Client) {
    this.requireHost(client);
    if (this.starterTimer) throw new GameError("O sorteio já está rolando.");
    this.state.starterId = this.game.draftStarter();
    this.starterTimer = this.clock.setTimeout(() => this.beginMatch(), STARTER_SPIN);
  }

  /** A roleta parou: as cartas saem, e o sorteio deixa de estar em curso. */
  private beginMatch() {
    this.starterTimer = undefined;
    this.stepTimer?.clear();
    this.stepTimer = undefined;
    const starter = this.state.starterId;
    this.state.starterId = "";
    try {
      this.game.start(starter);
    } catch {
      // A mesa desmanchou enquanto a roleta girava e não há mais partida a
      // começar. O lobby segue de pé, e o host sorteia de novo quando houver
      // gente — o `starterTimer` já foi embora, então a porta reabre sozinha.
    }
    this.sync();
  }

  private requireHost(client: Client) {
    if (client.sessionId !== this.state.hostId) {
      throw new GameError("Apenas o host pode fazer isso.");
    }
  }

  /** Espelha a metade pública da mesa no estado sincronizado, e entrega a privada. */
  private sync() {
    const { game, state } = this;

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

    this.syncPlayers();
    this.syncResults();
    this.syncCentre();
    this.syncLog();

    this.sendFx();
    this.sendHands();
    this.scheduleStep();
  }

  /**
   * Marca o próximo passo automático, se houver um e se ainda não houver um
   * relógio contando. Um passo por vez: `resume` pode deixar outro pendente, e
   * o `sync` logo abaixo o agenda na volta seguinte.
   */
  private scheduleStep() {
    const pending = this.game.pending;
    if (!pending || this.stepTimer) return;
    this.stepTimer = this.clock.setTimeout(() => {
      this.stepTimer = undefined;
      this.game.resume();
      this.sync();
    }, pending.delay);
  }

  /**
   * O placar da rodada. Ele nasce inteiro e morre inteiro — não é uma janela
   * que anda como o log —, então reescrevê-lo só quando ele MUDA de tamanho ou
   * de conteúdo já basta, e fora do `round_result` ele é uma lista vazia.
   */
  private syncResults() {
    const { results } = this.game;
    const mirrored = this.state.results;
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
   * Antes da mão, e antes do patch de estado: o evento é o aviso de que uma
   * carta está a caminho, e o cliente precisa dele para segurar a carta em vez
   * de mostrá-la no destino antes de o voo sair. A mão vai logo atrás na mesma
   * volta; o patch de estado sai sozinho, no intervalo do `patchRate`.
   */
  private sendFx() {
    const events = this.game.takeFx();
    if (events.length > 0) this.broadcast("fx", events satisfies FxMessage);
  }

  /**
   * A ponta visível do centro, escrita pelo fim.
   *
   * O caso comum é uma carta a mais no topo. Reescrever as oito para anunciar
   * uma custava oito objetos de esquema novos e um patch que apagava e
   * recriava a lista inteira — a cada jogada, para a mesa toda. Aqui entra o
   * que entrou e sai da frente o que saiu da janela.
   */
  private syncCentre() {
    const centre = this.game.trick;
    const grew = centre.length - this.state.centreCount;
    /*
     * Mesma altura E mesmo topo é a mesma pilha. Só a altura não bastava: uma
     * revanche começa do zero, que é exatamente onde certas partidas terminam
     * — e a mesa continuava mostrando a carta da anterior, porque o número não
     * tinha mexido.
     */
    if (grew === 0 && this.state.centre.at(-1)?.id === centre.at(-1)?.card.id) return;

    this.state.centreCount = centre.length;
    const visible = Math.min(VISIBLE_CENTRE, centre.length);

    if (grew > 0 && grew < visible) {
      for (const play of centre.slice(-grew)) {
        this.state.centre.push(CardState.from(play.card, play.playerId));
      }
      while (this.state.centre.length > visible) this.state.centre.shift();
      return;
    }

    this.state.centre.splice(0);
    for (const play of centre.slice(-visible)) {
      this.state.centre.push(CardState.from(play.card, play.playerId));
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
  private syncLog() {
    const { log, logSeq } = this.game;
    const fresh = logSeq - this.sentLogSeq;
    this.sentLogSeq = logSeq;

    // Pelo mesmo cuidado do centro: o contador zerado de uma partida nova pode
    // cair exatamente onde o da anterior parou.
    const mirrored = this.state.log;
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

  private syncPlayers() {
    const rosterChanged =
      this.state.players.length !== this.game.players.length ||
      this.game.players.some((player, i) => this.state.players[i]?.id !== player.id);

    if (rosterChanged) {
      this.state.players.splice(0);
      for (const player of this.game.players) {
        const entry = new PlayerState();
        entry.id = player.id;
        entry.name = player.name;
        this.state.players.push(entry);
      }
    }

    this.game.players.forEach((player, i) => {
      const entry = this.state.players[i];
      entry.connected = this.connected.has(player.id);
      entry.points = player.points;
      entry.overshoot = player.overshoot;
      // `-1` é "ainda não declarou". A promessa é pública desde que sai da
      // boca de quem a fez: o jogo é justamente sobre atrapalhar a dos outros.
      entry.promise = player.promise ?? -1;
      entry.tricks = player.tricks;
      entry.eliminated = player.eliminated;
    });
  }

  private sendHands() {
    for (const client of this.clients) this.sendHandTo(client);
  }

  /**
   * A metade privada da mesa, para um cliente só. Quem não joga não tem mão.
   *
   * E só quando ela mudou. Toda ação da mesa passa por `sync`, e `sync` mandava
   * a mão inteira para TODO mundo: uma jogada de um deles reescrevia o leque
   * dos dez, com as cartas uma a uma na rede e um redesenho da mesa inteira do
   * outro lado — para dizer que nada nele mudou. Os ids bastam para saber:
   * carta é identidade, e duas mãos com os mesmos ids são a mesma mão.
   *
   * `force` é para quem não tem passado com que comparar — quem acabou de
   * chegar, ou quem pediu a mesa de novo depois de o socket sumir.
   */
  private sendHandTo(client: Client, force = false) {
    const player = this.game.players.find((p) => p.id === client.sessionId);
    if (!player) return;

    const { cards, hiddenIds } = this.game.visibleHand(player.id);
    const playableIds = this.game.playableCards(player.id).map((c) => c.id);
    const peek = this.game.peekedHands(player.id);
    const promises = this.game.promiseOptions(player.id);

    const signature = [
      cards.map((c) => c.id).join(),
      hiddenIds.join(),
      playableIds.join(),
      peek.map((seat) => `${seat.playerId}:${seat.cards.map((c) => c.id).join("-")}`).join(),
      promises.join(),
    ].join("|");
    if (!force && this.sentHands.get(client.sessionId) === signature) return;
    this.sentHands.set(client.sessionId, signature);

    client.send("hand", {
      cards,
      hiddenIds,
      playableIds,
      peek,
      promises,
    } satisfies HandMessage);
  }

  /**
   * Códigos curtos e compartilháveis no lugar dos ids aleatórios do padrão.
   *
   * Pergunta por UM código de cada vez em vez de baixar a lista de todas as
   * salas abertas: a conferência é a mesma, e o que se deixa de trazer pela
   * rede é o servidor inteiro — a cada mesa criada, e justo quando ele está
   * cheio, que é quando a lista é maior.
   */
  private async generateRoomId(): Promise<string> {
    for (;;) {
      const id = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)],
      ).join("");
      if (await this.presence.sismember(LOBBY_CHANNEL, id)) continue;
      await this.presence.sadd(LOBBY_CHANNEL, id);
      return id;
    }
  }
}

function sanitize(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return text || fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
