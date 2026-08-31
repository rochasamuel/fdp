import {
  DEFAULT_HOUSE_RULES,
  ELIMINATION_LINGER,
  MIN_PLAYERS,
  PORCAO,
  PORCAO_ARMED,
  ZAP,
  ROUND_LINGER,
  STARTING_POINTS,
  TRICK_LINGER,
  allowedPromises,
  cardLabel,
  cardPower,
  isSameCard,
  isSpecialCard,
  nextHandSize,
  pointsLost,
  type Card,
  type FxEvent,
  type GamePhase,
  type HouseRules,
  type MatchStage,
  type PeekedHand,
  type RoundResult,
} from "@fdp/shared";
import { createDeck, shuffle } from "./deck.js";

/**
 * O FDP inteiro: rodadas, promessas, vazas, pontos e eliminação.
 *
 * Este objeto é a AUTORIDADE. O cliente manda intenções (`makePromise`,
 * `playCard`) e nada mais; quem sabe qual carta é de quem, de quem é a vez,
 * quanto vale cada carta e quem perdeu quantos pontos é este arquivo. Nenhuma
 * dessas respostas é conferida em outro lugar.
 *
 * Ele não conhece o Colyseus, e é determinístico: a única fonte de acaso é a
 * função `random` do construtor. Duas coisas dependem do RELÓGIO — a vaza
 * fechada que fica um instante na mesa e o placar da rodada —, e mesmo essas
 * não são timers daqui: o jogo diz o que está PENDENTE (`pending`) e quem tem
 * relógio chama `resume()`. Assim o teste roda a partida inteira sem esperar.
 */

/** Ação recusada. A sala transforma isto numa mensagem para aquele cliente. */
export class GameError extends Error {}

export type GamePlayer = {
  /** A sessão de agora. Muda quando ele cai e volta por outra conexão. */
  id: string;
  /** Quem ele é, entre uma conexão e outra. Ver `seatKey` no `@fdp/shared`. */
  key: string;
  name: string;
  hand: Card[];
  /** O que resta. Chegou a zero, saiu da mesa. */
  points: number;
  /** Quantas vazas ele prometeu nesta rodada; `null` antes de declarar. */
  promise: number | null;
  tricks: number;
  eliminated: boolean;
  /**
   * O que a última rodada daria SEM o piso do zero: 1 ponto perdendo 3 é `-2`.
   *
   * Existe para um caso só, e um caso raro: a rodada que zera todo mundo ao
   * mesmo tempo. Sem ele os últimos da mesa são todos "zero" e não há como
   * separá-los; com ele, vence quem chegou mais PERTO do zero, que é quem
   * aguentaria mais uma rodada se a partida continuasse.
   */
  overshoot: number;
};

/** Uma carta baixada na vaza, e quem a baixou. */
export type TrickPlay = { playerId: string; card: Card };

/** O que a mesa está esperando do relógio, e por quanto tempo. */
export type Pending = { step: "trick" | "result" | "elimination"; delay: number };

const LOG_SIZE = 12;

export class TableGame {
  players: GamePlayer[] = [];
  deck: Card[] = [];
  /** As cartas das vazas já fechadas. Não voltam para o monte nesta rodada. */
  discard: Card[] = [];
  /** A vaza em disputa, na ordem em que foi baixada. */
  trick: TrickPlay[] = [];

  stage: MatchStage = "waiting_for_players";
  round = 0;
  cardsPerPlayer = 0;
  dealerIndex = 0;
  /** Quem age agora — declara ou baixa. `-1` quando não é a vez de ninguém. */
  turnIndex = -1;
  /** Quem saiu na vaza em disputa. */
  leaderIndex = 0;
  trickNumber = 0;
  lastTrickWinnerId = "";
  /** O placar da rodada, enquanto ele está na tela. */
  results: RoundResult[] = [];
  winnerId = "";
  /** Quem venceu: um de costume, vários no empate, nenhum sem campeão. */
  winnerIds: string[] = [];
  /** O relógio de fora: ver o comentário do topo. */
  pending: Pending | null = null;

  log: string[] = [];
  /**
   * Quantas linhas o log já escreveu nesta partida, incluindo as que a janela
   * de doze já descartou. É por este número que a sala sabe quantas linhas são
   * novas — e mandar só as novas é a diferença entre um patch de uma operação
   * e um da lista inteira, a cada jogada e para a mesa toda.
   */
  logSeq = 0;
  private fx: FxEvent[] = [];

  /**
   * As regras opcionais da mesa. Ficam fora do construtor porque a sala nasce
   * antes de saber quais são — o `onCreate` do Colyseus é assíncrono e chega
   * depois. Trocá-las no meio de uma partida seria mudar o que vale uma carta
   * que já está na mão de alguém, então quem as escreve escreve uma vez.
   */
  rules: HouseRules = { ...DEFAULT_HOUSE_RULES };

  /**
   * O teto de cartas por rodada, se a mesa combinou um. `0` é o que o baralho
   * der. Escrito uma vez, junto das regras e pelo mesmo motivo: encurtar o
   * ciclo no meio da partida seria mudar quantas rodadas ainda faltam.
   */
  maxCards = 0;

  constructor(private random: () => number = Math.random) {}

  /** Lê e esvazia a fila de animação. A sala chama isto uma vez por sync. */
  takeFx(): FxEvent[] {
    return this.fx.splice(0);
  }

  /**
   * Os três momentos que a sala precisa distinguir para escolher a TELA:
   * a antessala, a mesa e o fim. O resto do detalhe está em `stage`.
   */
  get phase(): GamePhase {
    if (this.stage === "waiting_for_players") return "lobby";
    if (this.stage === "game_over") return "finished";
    return "playing";
  }

  get currentPlayer(): GamePlayer | undefined {
    return this.turnIndex === -1 ? undefined : this.players[this.turnIndex];
  }

  get dealer(): GamePlayer | undefined {
    return this.players[this.dealerIndex];
  }

  /** As cartas da vaza, sem os donos: é o que o centro da mesa desenha. */
  get centre(): Card[] {
    return this.trick.map((play) => play.card);
  }

  /**
   * A rodada às cegas é TODA rodada de uma carta.
   *
   * É a primeira da partida, e é cada uma que volta quando o ciclo das mãos
   * estoura o baralho e recomeça do 1. Faz sentido que seja assim: com uma
   * carta na mão e ela à vista, não há decisão nenhuma a tomar na promessa —
   * ou você tem a mais forte da mesa, ou não tem. Escondê-la é o que devolve o
   * jogo à rodada mais curta.
   */
  get blind(): boolean {
    return this.cardsPerPlayer === 1;
  }

  /** Quem ainda tem pontos. É esta lista que joga; os outros só assistem. */
  get active(): GamePlayer[] {
    return this.players.filter((player) => !player.eliminated);
  }

  /** A soma das promessas já declaradas nesta rodada. */
  get promised(): number {
    return this.active.reduce((total, player) => total + (player.promise ?? 0), 0);
  }

  /* ------------------------------------------------------------- a mesa */

  addPlayer(id: string, key: string, name: string) {
    if (this.phase !== "lobby") throw new GameError("A partida já começou.");
    if (this.players.some((p) => p.id === id)) return;
    this.players.push({
      id,
      key,
      name,
      hand: [],
      points: STARTING_POINTS,
      promise: null,
      tricks: 0,
      eliminated: false,
      overshoot: STARTING_POINTS,
    });
    this.pushLog(`${name} entrou na sala.`);
  }

  /** A cadeira de quem tem esta chave, se houver uma. */
  seatOf(key: string): GamePlayer | undefined {
    return key ? this.players.find((player) => player.key === key) : undefined;
  }

  /**
   * Devolve uma cadeira a quem voltou por outra conexão.
   *
   * A mão, os pontos, a promessa e a vez continuam de pé: o que muda é só por
   * qual socket a mesa fala com ele. Quem decide se a cadeira está livre para
   * ser reclamada é a sala, que é quem sabe quem está conectado.
   */
  reseat(player: GamePlayer, id: string) {
    const previous = player.id;
    player.id = id;
    if (previous === id) return;
    if (this.lastTrickWinnerId === previous) this.lastTrickWinnerId = id;
    for (const play of this.trick) {
      if (play.playerId === previous) play.playerId = id;
    }
    for (const result of this.results) {
      if (result.playerId === previous) result.playerId = id;
    }
    this.pushLog(`${player.name} voltou para a mesa.`);
  }

  /**
   * Tira alguém da mesa de vez — saiu, ou o prazo da queda venceu.
   *
   * Não é o mesmo que ser eliminado: o eliminado continua sentado, vendo a
   * partida com zero ponto. Quem sai daqui deixa de existir para o jogo, e o
   * que estava em curso se acomoda em volta do buraco: a rodada não é anulada,
   * as cartas que ele já baixou continuam valendo na vaza, e a etapa avança
   * sozinha se ele era o único que faltava agir.
   */
  removePlayer(id: string) {
    const index = this.players.findIndex((p) => p.id === id);
    if (index === -1) return;
    const [gone] = this.players.splice(index, 1);
    this.discard.push(...gone.hand);
    this.pushLog(`${gone.name} saiu.`);

    if (this.phase !== "playing") {
      if (this.players.length === 0) this.stage = "waiting_for_players";
      return;
    }

    /*
     * A cadeira vazia empurra a fila. Quem saiu estava ANTES de um índice: ele
     * anda uma casa para trás sem que nada tenha acontecido. Quem saiu ERA o
     * índice: ele já aponta para o seguinte, e não se mexe nele — só se cuida
     * de ele não ter caído fora do array.
     */
    const shift = (cursor: number) => {
      if (cursor === -1) return -1;
      const moved = index < cursor ? cursor - 1 : cursor;
      return this.players.length === 0 ? -1 : moved % this.players.length;
    };
    this.dealerIndex = Math.max(0, shift(this.dealerIndex));
    this.leaderIndex = Math.max(0, shift(this.leaderIndex));
    this.turnIndex = shift(this.turnIndex);
    if (this.turnIndex !== -1 && this.players[this.turnIndex].eliminated) {
      this.turnIndex = this.nextActive(this.turnIndex);
    }

    if (this.active.length < MIN_PLAYERS) return this.gameOver();
    this.settle();
  }

  /**
   * Sorteia quem começa, sem começar. Quem gira a roleta com este nome é a
   * sala; a partida só sai quando ela chamar `start` com ele.
   *
   * O sorteado é o primeiro DEALER — no FDP não existe "quem sai primeiro"
   * solto: quem sai é sempre o jogador à direita de quem reparte.
   */
  draftStarter(): string {
    this.requireStartable();
    return this.players[Math.floor(this.random() * this.players.length)].id;
  }

  start(starterId?: string) {
    this.requireStartable();

    this.winnerId = "";
    this.winnerIds = [];
    this.log = [];
    this.logSeq = 0;
    this.fx = [];
    this.results = [];
    this.discard = [];
    this.trick = [];
    this.round = 0;
    this.cardsPerPlayer = 0;
    this.lastTrickWinnerId = "";
    this.pending = null;

    for (const player of this.players) {
      player.points = STARTING_POINTS;
      player.hand = [];
      player.promise = null;
      player.tricks = 0;
      player.eliminated = false;
      player.overshoot = STARTING_POINTS;
    }

    const drafted = this.players.findIndex((p) => p.id === starterId);
    this.dealerIndex = drafted === -1 ? 0 : drafted;
    this.pushLog(`Sorteio: ${this.players[this.dealerIndex].name} reparte a primeira rodada.`);
    this.beginRound();
  }

  /* --------------------------------------------------------- as rodadas */

  /** Reparte, e abre as promessas. */
  private beginRound() {
    const active = this.active;
    if (active.length < MIN_PLAYERS) return this.gameOver();

    this.stage = "round_start";
    this.round++;
    this.results = [];
    this.trick = [];
    this.discard = [];
    this.lastTrickWinnerId = "";
    this.trickNumber = 1;

    /*
     * O ciclo `1 → 2 → … → máximo → 1`. O máximo é recalculado a cada rodada
     * porque ele depende de quantos ainda jogam: uma eliminação sobra baralho
     * para todo mundo, e a rodada seguinte pode subir mais uma carta.
     */
    this.cardsPerPlayer =
      this.round === 1 ? 1 : nextHandSize(this.cardsPerPlayer, active.length, this.maxCards);

    this.stage = "dealing";
    this.deck = shuffle(createDeck(), this.random);
    for (const player of this.players) {
      player.promise = null;
      player.tricks = 0;
      player.hand = player.eliminated ? [] : this.deck.splice(0, this.cardsPerPlayer);
      if (player.hand.length > 0) {
        this.fx.push({ k: "deal", to: player.id, n: player.hand.length });
      }
    }

    // O primeiro a declarar é o jogador à direita do dealer, e a roda segue
    // daí: o dealer é sempre o ÚLTIMO, que é quem carrega a proibição da soma.
    this.turnIndex = this.nextActive(this.dealerIndex);
    this.leaderIndex = this.turnIndex;
    this.stage = "making_promises";

    this.pushLog(
      `Rodada ${this.round}: ${this.cardsPerPlayer} carta${this.cardsPerPlayer > 1 ? "s" : ""} para cada um.`,
    );
    if (this.blind) this.pushLog("Às cegas: você vê a mão dos outros, menos a sua.");
  }

  /**
   * A promessa: quantas vazas ele diz que vai fazer.
   *
   * A conferência do último é a regra que sustenta o jogo inteiro — a soma não
   * pode bater com o número de cartas, senão todo mundo poderia acertar junto.
   * Ela mora aqui, no servidor, e a tela só repete o que este método já sabe.
   */
  makePromise(playerId: string, promise: number) {
    if (this.stage !== "making_promises") {
      throw new GameError("Não é hora de prometer.");
    }
    const player = this.requireTurn(playerId);
    if (!Number.isInteger(promise)) throw new GameError("Promessa inválida.");
    if (promise < 0) throw new GameError("A promessa não pode ser negativa.");
    if (promise > this.cardsPerPlayer) {
      throw new GameError(`A promessa não pode passar de ${this.cardsPerPlayer}.`);
    }
    if (!this.promiseOptions(playerId).includes(promise)) {
      throw new GameError(
        `A soma das promessas não pode dar ${this.cardsPerPlayer}. Escolha outro número.`,
      );
    }

    player.promise = promise;
    this.pushLog(`${player.name} prometeu ${promise}.`);

    if (this.active.every((p) => p.promise !== null)) return this.beginTricks();
    this.turnIndex = this.nextActive(this.turnIndex);
  }

  /**
   * As promessas que este jogador pode declarar agora. Vazio quando não é a vez
   * dele — é esta lista que a tela obedece para acender ou apagar cada botão.
   */
  promiseOptions(playerId: string): number[] {
    if (this.stage !== "making_promises" || this.currentPlayer?.id !== playerId) return [];
    const pendingBids = this.active.filter((p) => p.promise === null).length;
    return allowedPromises(this.cardsPerPlayer, this.promised, pendingBids === 1);
  }

  private beginTricks() {
    this.stage = "playing_trick";
    this.trickNumber = 1;
    // Quem saiu na primeira vaza é quem abriu as promessas: o jogador à
    // direita do dealer. Da segunda em diante, quem levou a anterior.
    this.leaderIndex = this.nextActive(this.dealerIndex);
    this.turnIndex = this.leaderIndex;
  }

  /* ---------------------------------------------------------- as jogadas */

  /**
   * Baixa uma carta na vaza.
   *
   * Não há naipe a seguir, não há trunfo e não há passar: quem tem a vez baixa
   * uma carta qualquer da mão. Fechada a vaza, ela fica um instante na mesa
   * (`pending`) antes de as cartas saírem.
   */
  playCard(playerId: string, cardId: string) {
    if (this.stage !== "playing_trick") throw new GameError("Não é hora de jogar carta.");
    const player = this.requireTurn(playerId);
    if (this.trick.some((play) => play.playerId === playerId)) {
      throw new GameError("Você já jogou nesta mão.");
    }
    const index = player.hand.findIndex((c) => c.id === cardId);
    if (index === -1) throw new GameError("Você não tem essa carta.");

    const [card] = player.hand.splice(index, 1);
    this.trick.push({ playerId, card });
    this.fx.push({ k: "play", by: playerId });
    this.pushLog(`${player.name} jogou ${cardLabel(card)}.`);

    if (this.trick.length >= this.active.length) return this.closeTrick();
    this.turnIndex = this.nextActive(this.turnIndex);
  }

  /**
   * A vaza está completa: decide-se quem levou, e ela fica na mesa esperando o
   * relógio. Ninguém tem a vez enquanto ela está lá.
   */
  private closeTrick() {
    if (this.trick.length === 0) return;
    const winner = this.trickWinner();
    this.turnIndex = -1;
    this.lastTrickWinnerId = winner?.playerId ?? "";

    if (winner) {
      const player = this.players.find((p) => p.id === winner.playerId);
      if (player) player.tricks++;
      this.pushLog(`${player?.name ?? "Alguém"} levou a mão ${this.trickNumber}.`);
    } else {
      // Cangar: anulou-se tudo o que estava na mesa. A vaza não foi de ninguém
      // e não conta para promessa nenhuma.
      this.pushLog(`A mão ${this.trickNumber} se anulou: não é de ninguém.`);
    }

    this.fx.push({ k: "trick", winner: this.lastTrickWinnerId });
    this.pending = { step: "trick", delay: TRICK_LINGER };
  }

  /**
   * Quem levou a vaza — ou `undefined`, quando ela se anulou inteira.
   *
   * São três camadas, nesta ordem:
   *
   * 1. **Cangar** tira da disputa as cartas de valor repetido (`survivors`).
   * 2. **Porcão** reescreve a força do 4♠ conforme o zap estar na mesa ou não.
   * 3. O resto é a hierarquia de sempre, que é uma ordem TOTAL: valor primeiro,
   *    naipe depois. Não há empate a resolver — duas cartas do mesmo valor têm
   *    naipes diferentes, e as cinco manilhas são únicas no baralho.
   */
  private trickWinner(): TrickPlay | undefined {
    let best: TrickPlay | undefined;
    for (const play of this.survivors()) {
      if (!best || this.strength(play.card) > this.strength(best.card)) best = play;
    }
    return best;
  }

  /**
   * O que continua disputando a vaza.
   *
   * Sem o cangar, tudo. Com ele, as cartas de valor REPETIDO se anulam entre si
   * — três valetes somem juntos —, e o que sobra decide. As manilhas nunca se
   * anulam: cada uma é única no baralho, então elas nem teriam com quem, mas a
   * conta as deixa de fora explicitamente para o dia em que alguém mexer no
   * baralho. O porcão armado conta como manilha, porque armado é o que ele é.
   *
   * Anulado tudo, ninguém leva: quem lê isto é o `closeTrick`.
   */
  private survivors(): TrickPlay[] {
    if (!this.rules.cangar) return this.trick;

    const repeated = new Map<string, number>();
    for (const play of this.trick) {
      if (this.immune(play.card)) continue;
      repeated.set(play.card.rank, (repeated.get(play.card.rank) ?? 0) + 1);
    }
    return this.trick.filter(
      (play) => this.immune(play.card) || (repeated.get(play.card.rank) ?? 0) < 2,
    );
  }

  /** Uma carta que o cangar não anula. */
  private immune(card: Card): boolean {
    return isSpecialCard(card) || this.porcaoArmed(card);
  }

  /**
   * A força desta carta NESTA vaza.
   *
   * Só o porcão faz a força depender da mesa, e é o que a regra diz: o 4♠ mata
   * o 4♣ e exclusivamente ele. Com o zap baixado, o porcão passa a ser a carta
   * mais forte que existe; sem o zap, ele é a mais fraca do baralho — abaixo do
   * 4 de ouros, que é a menor carta comum.
   */
  private strength(card: Card): number {
    if (!this.rules.porcao || !isSameCard(card, PORCAO)) return cardPower(card);
    return this.zapOnTable() ? PORCAO_ARMED : 0;
  }

  private porcaoArmed(card: Card): boolean {
    return this.rules.porcao && isSameCard(card, PORCAO) && this.zapOnTable();
  }

  private zapOnTable(): boolean {
    return this.trick.some((play) => isSameCard(play.card, ZAP));
  }

  /**
   * O passo seguinte, quando o relógio de fora deixa. Um passo por chamada:
   * a vaza sai da mesa, o placar entra, os eliminados se despedem, a rodada
   * nova começa.
   */
  resume() {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;

    if (pending.step === "trick") return this.clearTrick();
    if (pending.step === "result") return this.eliminate();
    return this.beginRound();
  }

  /**
   * As cartas da vaza saem, e quem a levou começa a próxima.
   *
   * A vaza anulada pelo cangar não tem vencedor, e aí o `leaderIndex` fica onde
   * estava: quem saiu nela sai de novo. Ela não aconteceu para ninguém,
   * inclusive para a ordem.
   */
  private clearTrick() {
    this.discard.push(...this.centre);
    this.trick = [];

    const winner = this.players.findIndex((p) => p.id === this.lastTrickWinnerId);
    if (winner !== -1) this.leaderIndex = winner;

    if (this.active.every((player) => player.hand.length === 0)) return this.endRound();

    this.trickNumber++;
    this.turnIndex = this.leaderIndex;
  }

  /**
   * Fim da rodada: compara promessa com vaza, desconta a diferença e marca
   * quem chegou a zero. É a única conta de pontos do jogo, e ela só desce.
   */
  private endRound() {
    this.stage = "round_result";
    this.turnIndex = -1;
    this.results = [];

    for (const player of this.active) {
      const promise = player.promise ?? 0;
      const lost = pointsLost(promise, player.tricks);
      // Nunca abaixo de zero: quem devia perder três com um ponto na mão
      // termina em zero, e não em menos dois. O valor sem o piso fica guardado,
      // e serve para desempatar a rodada que zera a mesa inteira de uma vez.
      player.overshoot = player.points - lost;
      player.points = Math.max(0, player.overshoot);
      const eliminated = player.points === 0;
      this.results.push({
        playerId: player.id,
        promise,
        tricks: player.tricks,
        lost,
        points: player.points,
        overshoot: player.overshoot,
        eliminated,
      });
      this.pushLog(
        lost === 0
          ? `${player.name} cumpriu ${promise} e não perdeu nada.`
          : `${player.name} prometeu ${promise}, fez ${player.tricks} e perdeu ${lost}.`,
      );
    }

    this.pending = { step: "result", delay: ROUND_LINGER };
  }

  /** Quem chegou a zero sai da mesa — e a partida pode acabar aqui. */
  private eliminate() {
    const doomed = this.results.filter((result) => result.eliminated);
    for (const result of doomed) {
      const player = this.players.find((p) => p.id === result.playerId);
      if (!player) continue;
      player.eliminated = true;
      player.hand = [];
      player.promise = null;
      this.pushLog(`${player.name} chegou a zero e está fora.`);
    }

    if (this.active.length <= 1) return this.gameOver();

    if (doomed.length > 0) {
      this.stage = "player_elimination";
      this.pending = { step: "elimination", delay: ELIMINATION_LINGER };
      this.passDealer();
      return;
    }

    this.passDealer();
    this.beginRound();
  }

  /** O dealer passa para o próximo jogador no sentido horário, todo fim de rodada. */
  private passDealer() {
    this.dealerIndex = this.nextActive(this.dealerIndex);
  }

  private gameOver() {
    this.stage = "game_over";
    this.pending = null;
    this.turnIndex = -1;
    this.trick = [];

    const survivors = this.active;
    if (survivors.length === 1) {
      this.winnerIds = [survivors[0].id];
      this.winnerId = survivors[0].id;
      this.pushLog(`${survivors[0].name} é o último de pé e venceu a partida.`);
      return;
    }

    /*
     * Ninguém sobrou: a última rodada zerou a mesa inteira de uma vez. Zero é
     * zero para todos, então quem decide é o quanto cada um passou DO zero —
     * vence quem chegou mais perto dele. Quem tinha 3 e perdeu 3 parou exato no
     * zero; quem tinha 1 e perdeu 3 parou dois abaixo, e perdeu por isso. E
     * quem parou no mesmo ponto empata: não há critério para separá-los.
     */
    const tied = this.results
      .filter((result) => result.eliminated)
      .map((result) => this.players.find((player) => player.id === result.playerId))
      .filter((player): player is GamePlayer => player !== undefined);

    if (tied.length === 0) {
      this.winnerIds = [];
      this.winnerId = "";
      this.pushLog("A partida acabou sem ninguém de pé.");
      return;
    }

    const closest = Math.max(...tied.map((player) => player.overshoot));
    // Todos que pararam no MESMO ponto dividem a vitória: com o mesmo saldo
    // ninguém chegou mais perto do zero do que o outro, e a mesa não tem
    // critério nenhum para separá-los — nem a ordem das cadeiras, que é sorte
    // de quem sentou primeiro. Empate é empate.
    const champions = tied.filter((player) => player.overshoot === closest);

    this.winnerIds = champions.map((player) => player.id);
    this.winnerId = champions.length === 1 ? champions[0].id : "";

    const saldo = closest < 0 ? `${closest}` : "zero";
    this.pushLog(
      champions.length === 1
        ? `Todos zeraram: ${champions[0].name} parou em ${saldo} e venceu a partida.`
        : `Todos zeraram em ${saldo}: ${champions.map((p) => p.name).join(", ")} empataram.`,
    );
  }

  /* ------------------------------------------------------------ a leitura */

  /**
   * O que a mão de alguém pode baixar agora.
   *
   * Não há naipe a seguir nem trunfo: na vez dele, a mão inteira. Fora dela,
   * nada. É este método que a tela obedece para acender ou apagar cada carta —
   * quem decide o que é jogável é sempre o servidor.
   */
  playableCards(playerId: string): Card[] {
    if (this.stage !== "playing_trick" || this.currentPlayer?.id !== playerId) return [];
    return this.players.find((p) => p.id === playerId)?.hand ?? [];
  }

  /**
   * O que ele PODE ver da própria mão.
   *
   * Na rodada às cegas, nada: a carta existe, dá para jogá-la, e o valor dela
   * não sai do servidor. Fora dela, a mão inteira.
   */
  visibleHand(playerId: string): { cards: Card[]; hiddenIds: string[] } {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { cards: [], hiddenIds: [] };
    if (!this.blind || this.phase !== "playing") return { cards: player.hand, hiddenIds: [] };
    return { cards: [], hiddenIds: player.hand.map((card) => card.id) };
  }

  /** As mãos dos ADVERSÁRIOS, que na rodada às cegas são abertas para todos. */
  peekedHands(playerId: string): PeekedHand[] {
    if (!this.blind || this.phase !== "playing") return [];
    return this.active
      .filter((player) => player.id !== playerId && player.hand.length > 0)
      .map((player) => ({ playerId: player.id, cards: player.hand }));
  }

  /* --------------------------------------------------------------- privado */

  /**
   * A etapa se acomoda depois de alguém sair da mesa: se quem faltava declarar
   * ou baixar era justamente ele, ninguém mais precisa agir para a etapa
   * fechar. Sem isto a mesa ficava esperando uma cadeira vazia.
   */
  private settle() {
    if (this.stage === "making_promises") {
      if (this.active.every((p) => p.promise !== null)) this.beginTricks();
      else if (this.turnIndex === -1) this.turnIndex = this.nextActive(this.dealerIndex);
      return;
    }
    if (this.stage === "playing_trick" && !this.pending) {
      if (this.trick.length >= this.active.length) return this.closeTrick();
      if (this.turnIndex === -1 || this.players[this.turnIndex].eliminated) {
        this.turnIndex = this.nextToPlay();
      }
    }
  }

  /**
   * O primeiro que ainda não baixou nesta vaza, procurando a partir de quem
   * saiu. Só serve para remendar a vez depois de alguém deixar a mesa.
   */
  private nextToPlay(): number {
    const total = this.players.length;
    for (let step = 0; step < total; step++) {
      const index = (this.leaderIndex + step) % total;
      const player = this.players[index];
      if (player.eliminated) continue;
      if (!this.trick.some((play) => play.playerId === player.id)) return index;
    }
    return -1;
  }

  /** O próximo jogador vivo depois deste índice, no sentido da mesa. */
  private nextActive(from: number): number {
    const total = this.players.length;
    if (total === 0) return -1;
    const start = ((from % total) + total) % total;
    for (let step = 1; step <= total; step++) {
      const index = (start + step) % total;
      if (!this.players[index].eliminated) return index;
    }
    return -1;
  }

  private requireTurn(playerId: string): GamePlayer {
    if (this.phase !== "playing") throw new GameError("A partida não está em andamento.");
    const player = this.currentPlayer;
    if (!player || player.id !== playerId) throw new GameError("Não é a sua vez.");
    if (player.eliminated) throw new GameError("Você já está fora da partida.");
    return player;
  }

  private requireStartable() {
    if (this.phase === "playing") throw new GameError("A partida já começou.");
    if (this.players.length < MIN_PLAYERS) {
      throw new GameError(`São necessários pelo menos ${MIN_PLAYERS} jogadores.`);
    }
  }

  private pushLog(message: string) {
    this.log.push(message);
    this.logSeq++;
    if (this.log.length > LOG_SIZE) this.log.splice(0, this.log.length - LOG_SIZE);
  }
}
