/*
 * O contrato entre o servidor e a mesa. Aqui só mora o que os dois lados
 * precisam concordar: o formato de uma carta, o formato do estado público e os
 * nomes das mensagens.
 *
 * A REGRA mora em `apps/server/src/game/`. O que chega aqui é o pouco dela que
 * a tela precisa saber para desenhar e para não oferecer o impossível: a força
 * de uma carta (a tela ordena o leque por ela), os estados da partida e os
 * limites de uma promessa. Quem valida continua sendo o servidor, sempre.
 */

/* ------------------------------------------------------------------ baralho */

/**
 * O baralho francês, na ordem em que `tools/cards/gen_card.py` o desenha. Os
 * nomes são os dos arquivos de arte: mudar um nome aqui é mudar o nome de um
 * SVG, e é por isso que eles são em inglês enquanto o resto fala português.
 */
export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export const RED_SUITS = ["hearts", "diamonds"] as const;
export const RANKS = ["a", "2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k"] as const;
/**
 * As duas cores de coringa. O coringa não tem naipe: tem tinta.
 *
 * As DUAS artes existem, mas o baralho do FDP leva um coringa só — ver
 * `DECK_JOKER`. Dois coringas seriam duas cartas com a mesma força, e a vaza
 * empatada é a única pergunta que a hierarquia do jogo não responde.
 */
export const JOKERS = ["red", "black"] as const;

/** O coringa que entra no baralho. Um só, e sempre o mesmo. */
export const DECK_JOKER = "black" as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Joker = (typeof JOKERS)[number];

/**
 * Uma carta. O coringa é `suit: "joker"` e o rank guarda a tinta, e não um
 * valor — assim toda carta cabe no mesmo par (naipe, rank) e o nome do arquivo
 * de arte sai dos dois campos sem exceção nenhuma.
 */
export type Card = {
  id: string;
  suit: Suit | "joker";
  rank: Rank | Joker;
};

export const isJoker = (card: Pick<Card, "suit">) => card.suit === "joker";

export const isRed = (card: Pick<Card, "suit" | "rank">) =>
  isJoker(card) ? card.rank === "red" : RED_SUITS.includes(card.suit as (typeof RED_SUITS)[number]);

/** O nome de cada naipe, em português. É o vocabulário do log e da interface. */
export const SUIT_NAME: Record<Suit | "joker", string> = {
  spades: "espadas",
  hearts: "copas",
  diamonds: "ouros",
  clubs: "paus",
  joker: "coringa",
};

/** O símbolo de cada naipe, para onde o nome por extenso não cabe. */
export const SUIT_PIP: Record<Suit | "joker", string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  joker: "★",
};

/** Como o rank se lê em voz alta. Os números falam por si. */
const RANK_NAME: Record<string, string> = {
  a: "ás",
  j: "valete",
  q: "dama",
  k: "rei",
};

export function cardLabel(card: Pick<Card, "suit" | "rank">): string {
  if (isJoker(card)) return `coringa ${card.rank === "red" ? "vermelho" : "preto"}`;
  return `${RANK_NAME[card.rank] ?? card.rank} de ${SUIT_NAME[card.suit]}`;
}

/**
 * O nome do arquivo da arte, sem extensão: `fdp-hearts-q`, `fdp-joker-red`.
 * É a mesma regra de nomes de `tools/cards/README.md`, e é ela que deixa montar
 * a URL direto do estado do jogo.
 */
export const cardArt = (card: Pick<Card, "suit" | "rank">) => `fdp-${card.suit}-${card.rank}`;

/* ---------------------------------------------------------- força da carta */

/**
 * A hierarquia do FDP, da mais fraca para a mais forte:
 *
 * `4 < 5 < 6 < 7 < 8 < 9 < 10 < Q < J < K < A < 2 < 3 < Joker < 7♦ < A♠ < 7♥ < 4♣`
 *
 * Ela é EXPLÍCITA de propósito. Quatro cartas fogem do próprio rank — o 4♣ é a
 * mais forte do baralho enquanto os outros quatros são as mais fracas, e o 7♦ e
 * o 7♥ passam por cima dos outros sietes —, e força derivada do valor numérico
 * é justamente o lugar onde esse tipo de exceção vira bug silencioso. Aqui a
 * exceção é uma linha da tabela, e não um `if` escondido numa comparação.
 *
 * A tabela é indexada por `naipe-rank`, com um fallback por rank. Um número
 * maior é uma carta mais forte, e os intervalos entre eles não significam nada.
 */
const RANK_POWER: Record<string, number> = {
  "4": 1,
  "5": 2,
  "6": 3,
  "7": 4,
  "8": 5,
  "9": 6,
  "10": 7,
  q: 8,
  j: 9,
  k: 10,
  a: 11,
  "2": 12,
  "3": 13,
};

/**
 * As cinco que não seguem o próprio rank. O coringa não tem naipe: tem tinta,
 * e as duas tintas valem o mesmo — o baralho leva um só, então elas nunca se
 * encontram numa vaza.
 */
const SPECIAL_POWER: Record<string, number> = {
  "joker-red": 14,
  "joker-black": 14,
  "diamonds-7": 15,
  "spades-a": 16,
  "hearts-7": 17,
  "clubs-4": 18,
};

/**
 * O desempate por naipe: `♦ < ♠ < ♥ < ♣`.
 *
 * Duas cartas do mesmo valor não têm o mesmo valor: o naipe as separa, e a
 * ordem é a do truco. O coringa não tem naipe, e não precisa — ele é único no
 * baralho, então nunca disputa este critério com ninguém.
 */
const SUIT_POWER: Record<string, number> = {
  diamonds: 1,
  spades: 2,
  hearts: 3,
  clubs: 4,
  joker: 0,
};

/** Os naipes do mais fraco para o mais forte, para o tutorial desenhá-los. */
export const SUIT_LADDER = ["diamonds", "spades", "hearts", "clubs"] as const;

/** A carta mais forte do jogo — o zap. */
export const ZAP = { suit: "clubs", rank: "4" } as const;
/** O porcão: a carta que, com a regra ligada, mata o zap. */
export const PORCAO = { suit: "spades", rank: "4" } as const;

export const isSameCard = (
  a: Pick<Card, "suit" | "rank">,
  b: Pick<Card, "suit" | "rank">,
) => a.suit === b.suit && a.rank === b.rank;

/**
 * A força de uma carta. Maior vence; a escala não tem outro significado.
 *
 * São dois critérios num número só: o valor manda, e o naipe desempata. O
 * valor é multiplicado por 10 e o naipe entra nas unidades — como o naipe vai
 * no máximo a 4, ele nunca alcança o degrau do valor seguinte, e um 5 continua
 * perdendo para qualquer 6.
 */
export function cardPower(card: Pick<Card, "suit" | "rank">): number {
  const rank = SPECIAL_POWER[`${card.suit}-${card.rank}`] ?? RANK_POWER[card.rank] ?? 0;
  return rank * 10 + (SUIT_POWER[card.suit] ?? 0);
}

/** A força que o porcão tem quando o zap está na mesa: acima de tudo. */
export const PORCAO_ARMED = cardPower(ZAP) + 1;

/** É uma das cinco que fogem do próprio rank? A tela as destaca. */
export const isSpecialCard = (card: Pick<Card, "suit" | "rank">) =>
  `${card.suit}-${card.rank}` in SPECIAL_POWER;

/**
 * A hierarquia inteira em ordem, para o tutorial desenhá-la. É a mesma tabela
 * acima lida do outro lado — se uma linha mudar lá, esta lista muda junto.
 */
export const HIERARCHY: { label: string; card: Pick<Card, "suit" | "rank">; special: boolean }[] =
  [
    { label: "4", card: { suit: "spades", rank: "4" }, special: false },
    { label: "5", card: { suit: "spades", rank: "5" }, special: false },
    { label: "6", card: { suit: "spades", rank: "6" }, special: false },
    { label: "7", card: { suit: "spades", rank: "7" }, special: false },
    { label: "8", card: { suit: "spades", rank: "8" }, special: false },
    { label: "9", card: { suit: "spades", rank: "9" }, special: false },
    { label: "10", card: { suit: "spades", rank: "10" }, special: false },
    { label: "Q", card: { suit: "spades", rank: "q" }, special: false },
    { label: "J", card: { suit: "spades", rank: "j" }, special: false },
    { label: "K", card: { suit: "spades", rank: "k" }, special: false },
    { label: "A", card: { suit: "hearts", rank: "a" }, special: false },
    { label: "2", card: { suit: "spades", rank: "2" }, special: false },
    { label: "3", card: { suit: "spades", rank: "3" }, special: false },
    { label: "Coringa", card: { suit: "joker", rank: DECK_JOKER }, special: true },
    { label: "7♦", card: { suit: "diamonds", rank: "7" }, special: true },
    { label: "A♠", card: { suit: "spades", rank: "a" }, special: true },
    { label: "7♥", card: { suit: "hearts", rank: "7" }, special: true },
    { label: "4♣", card: { suit: "clubs", rank: "4" }, special: true },
  ];

/* -------------------------------------------------------------- a mesa */

export type GamePhase = "lobby" | "playing" | "finished";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const DEFAULT_MAX_PLAYERS = 4;

/* ------------------------------------------------------------- a regra */

/**
 * Com quantos pontos todo mundo senta, quando a mesa não escolhe outro número.
 * Daqui em diante a conta só desce.
 */
export const STARTING_POINTS = 10;

/**
 * O maior número de pontos que dá para combinar na criação da mesa. Mais que
 * isso é uma partida que não acaba na mesma noite. Cinco camadas de dez no
 * mostrador de pontos — é até onde a fileira de casulos continua legível.
 */
export const MAX_STARTING_POINTS = 50;

/** O menor: um ponto é uma rodada de vida. */
export const MIN_STARTING_POINTS = 1;

/** O baralho inteiro: 52 e um coringa. É o teto do que dá para repartir. */
export const DECK_SIZE = 53;

/**
 * O maior número de cartas que dá para dar IGUALMENTE a todo mundo.
 *
 * O que não couber na divisão fica fora da mão de todos — não vira mão maior
 * para ninguém, e é isso que faz o ciclo `1 → 2 → … → máximo → 1` ter um
 * máximo definido em vez de terminar num reparto torto.
 */
export const maxHandSize = (players: number, cap = 0) => {
  if (players <= 0) return 0;
  const fits = Math.floor(DECK_SIZE / players);
  // O teto da mesa é um limite A MAIS, e não outro limite: ele encurta o ciclo,
  // nunca o estica além do que o baralho dá. Zero é "sem teto".
  return cap > 0 ? Math.min(fits, cap) : fits;
};

/**
 * O maior teto que faz alguma diferença: o que uma mesa de dois comporta. Acima
 * disto o número escolhido nunca seria alcançado em mesa nenhuma.
 */
export const MAX_CARDS_CAP = maxHandSize(MIN_PLAYERS);

/**
 * A mão da rodada seguinte. Sobe de um em um e volta para 1 quando não cabe
 * mais outra cartada igual para todos — ou quando bate no teto da mesa.
 */
export function nextHandSize(current: number, players: number, cap = 0): number {
  const max = maxHandSize(players, cap);
  if (max < 1) return 0;
  return current >= max ? 1 : current + 1;
}

/**
 * Quanto se perde numa rodada: a distância entre o que se prometeu e o que se
 * fez. Zero é o único resultado bom, e passar da promessa dói tanto quanto
 * ficar aquém — é isso que faz vencer uma vaza a mais ser um problema.
 */
export const pointsLost = (promise: number, tricks: number) => Math.abs(promise - tricks);

/**
 * A promessa que o ÚLTIMO a declarar não pode fazer, ou `null` quando ele pode
 * qualquer uma.
 *
 * A soma das promessas nunca pode bater com o número de cartas da mão — se
 * batesse, todo mundo poderia cumprir a sua ao mesmo tempo, e o jogo perderia
 * a única coisa que ele é. Como o último fecha a soma, é ele quem carrega a
 * proibição; às vezes ela é uma escolha a menos, e às vezes é uma escolha só.
 *
 * A conta vive aqui, e não só no servidor, porque a tela precisa dela para
 * apagar o botão antes do toque. Quem RECUSA continua sendo o servidor.
 */
export function forbiddenPromise(sumSoFar: number, cards: number): number | null {
  const missing = cards - sumSoFar;
  return missing >= 0 && missing <= cards ? missing : null;
}

/** As promessas que um jogador pode declarar agora. */
export function allowedPromises(cards: number, sumSoFar: number, isLast: boolean): number[] {
  const forbidden = isLast ? forbiddenPromise(sumSoFar, cards) : null;
  return Array.from({ length: cards + 1 }, (_, n) => n).filter((n) => n !== forbidden);
}

/**
 * As regras opcionais da mesa. Escolhidas na criação e fixas pela partida
 * inteira: mudar o que uma carta vale no meio do jogo é mudar a mão que as
 * pessoas já viram.
 */
export type HouseRules = {
  /**
   * **Cangar** — cartas de valor igual SE ANULAM, e nenhuma delas leva a vaza.
   * As manilhas não se anulam (e nem teriam com quem: cada uma é única no
   * baralho). Anulado tudo, a vaza não é de ninguém, e quem saiu nela sai de
   * novo na seguinte.
   */
  cangar: boolean;
  /**
   * **Porcão** — o 4♠ mata o 4♣, e exclusivamente ele. Com o zap na mesa, o
   * porcão passa a ser a carta mais forte da vaza; sem o zap, ele é a mais
   * fraca do baralho.
   */
  porcao: boolean;
};

export const DEFAULT_HOUSE_RULES: HouseRules = { cangar: false, porcao: false };

/**
 * As regras da casa como a TELA as escreve: o rótulo curto e o que elas fazem,
 * numa frase.
 *
 * Aqui e não em cada tela: a mesma frase aparece na criação da mesa, onde se
 * escolhe, e no painel do cabeçalho, onde se confere no meio da partida. Duas
 * cópias da mesma explicação divergem no primeiro ajuste que alguém fizer em
 * uma delas.
 */
export const RULES: { key: keyof HouseRules; label: string; hint: string }[] = [
  {
    key: "cangar",
    label: "Cangar",
    hint: "Cartas de valor igual se anulam e saem da disputa: a mão vai para a mais forte que sobrou. Anulou tudo, a mão não é de ninguém, e quem saiu nela sai de novo. Manilha não anula.",
  },
  {
    key: "porcao",
    label: "Porcão",
    hint: "O 4♠ mata o 4♣, e exclusivamente ele: com o zap na mesa é a carta mais forte da mão; sem ele, é a mais fraca do baralho.",
  },
];

/**
 * Onde a partida está. É a máquina de estados inteira, e é ela que decide o
 * que a mesa aceita: promessa fora de `making_promises` e carta fora de
 * `playing_trick` são recusadas antes de qualquer outra conferência.
 */
export type MatchStage =
  | "waiting_for_players"
  | "round_start"
  | "dealing"
  | "making_promises"
  | "playing_trick"
  | "round_result"
  | "player_elimination"
  | "game_over";

/** O que um jogador prometeu e o que ele fez, no fim de uma rodada. */
export type RoundResult = {
  playerId: string;
  promise: number;
  tricks: number;
  /** `|promessa - vazas|` */
  lost: number;
  /** Pontos DEPOIS do desconto, com o piso do zero. */
  points: number;
  /**
   * Os mesmos pontos SEM o piso: quem tinha 1 e perdeu 3 termina em `-2` aqui
   * e em `0` ali. É o que a tela mostra quando a rodada zera mais de um de uma
   * vez — sem ele todos são "zero" e não dá para ver quem passou menos.
   */
  overshoot: number;
  eliminated: boolean;
};

/**
 * Quanto tempo, em ms, a vaza fechada fica na mesa antes de as cartas saírem.
 * Sem esta pausa a vaza que decide a rodada aparece e some no mesmo quadro, e
 * quem estava olhando para a própria mão nunca vê quem ganhou.
 */
export const TRICK_LINGER = 1600;

/** O mesmo, para o placar da rodada: aqui há uma tabela inteira para ler. */
export const ROUND_LINGER = 6000;

/** E para o aviso de quem saiu da mesa por ter chegado a zero. */
export const ELIMINATION_LINGER = 3200;

/**
 * Quanto tempo, em ms, a roleta do sorteio gira antes de as cartas serem
 * repartidas. É o servidor que conta: o sorteado já está decidido quando a
 * roleta começa, e o que este número compra é a mesa inteira vendo a mesma
 * volta ao mesmo tempo. Curto demais e ninguém lê o nome; longo demais e vira
 * pedágio entre apertar "Começar" e jogar — dois segundos e meio é uma volta
 * que desacelera, para e ainda deixa o nome parado por um instante.
 */
export const STARTER_SPIN = 2600;

/**
 * Segundos que um jogador caído mantém o lugar durante a partida. Segurar o
 * lugar por muito tempo é o que trava a mesa quando a queda é na vez dele: os
 * outros ficam olhando um relógio que não é deles. Um minuto e meio é o que
 * cobre um elevador ou um túnel sem transformar a partida em sala de espera.
 */
export const RECONNECT_TIMEOUT = 90;
/**
 * O mesmo, fora da partida — e aqui pode ser generoso, porque ninguém está
 * esperando uma vez. O caso comum não é a internet cair: é o host sair do
 * navegador para mandar o link no WhatsApp. O celular congela a aba, o socket
 * morre, e a mesa recém-criada, que só tem ele, some junto. Enquanto o lugar
 * está guardado a sala continua de pé, então este número é também o tempo que
 * uma mesa vazia sobrevive ao seu criador.
 */
export const LOBBY_RECONNECT_TIMEOUT = 300;

/* ------------------------------------------------------------ conversa */

/**
 * O vocabulário da mesa. É fechado de propósito: com ele não se ofende, não se
 * combina jogada por fora e não se digita nada em partida — cada emoji é uma
 * frase inteira. A lista é a mesma dos dois lados, e o servidor só aceita o que
 * está aqui; um emoji novo é uma linha neste array e mais nada.
 *
 * A ordem é a da grade na tela, lida da esquerda para a direita: primeiro o que
 * se diz sobre a jogada dos outros, depois o que se diz sobre a própria.
 */
export const EMOTES = ["😂", "😱", "😡", "😭", "👏", "👍", "👎", "🤔", "😎", "🙏"] as const;

export type Emote = (typeof EMOTES)[number];

export const isEmote = (value: unknown): value is Emote => EMOTES.includes(value as Emote);

/**
 * Quanto tempo, em ms, um jogador espera entre dois emojis.
 *
 * Não é moderação, é ritmo: sem isto a mesa vira metralhadora de balões e a
 * conversa deixa de ser legível justamente para quem está tentando jogar. Um
 * segundo e meio deixa reagir a uma jogada e ainda emendar um segundo emoji,
 * mas não deixa segurar o botão.
 */
export const EMOTE_COOLDOWN = 1500;

/**
 * Quanto tempo, em ms, o balão fica na tela antes de sumir sozinho.
 *
 * Um emoji é um instante, não uma situação: ele acompanha a jogada que
 * comentou e vai embora com ela. Três segundos é o que alguém do outro lado da
 * mesa leva para olhar para cima, ler e voltar para a própria mão.
 */
export const EMOTE_LINGER = 3000;

/* ---------------------------------------------------------------- protocolo */

/**
 * O estado público da sala, exatamente como os clientes o recebem.
 * `TableRoomState` no servidor é o schema que produz este formato.
 *
 * Público é a palavra que importa: a mão de um jogador NÃO está aqui. Ela vai
 * numa mensagem `hand` endereçada só ao dono. O que a mesa sabe de cada um é
 * quantas cartas ele tem.
 */
export type PublicCard = {
  id: string;
  suit: Suit | "joker";
  rank: Rank | Joker;
  /** Quem baixou esta carta na vaza. Vazio quando ninguém baixou. */
  owner: string;
};

export type PublicPlayer = {
  id: string;
  name: string;
  connected: boolean;
  /** Os pontos que ainda restam. Zero é a porta da rua. */
  points: number;
  /** Os pontos da última rodada sem o piso do zero: pode ser negativo. */
  overshoot: number;
  /** Quantas vazas ele disse que faria. `-1` enquanto ele não declarou. */
  promise: number;
  /** Quantas ele fez até agora nesta rodada. */
  tricks: number;
  eliminated: boolean;
};

export type TableState = {
  roomName: string;
  hostId: string;
  phase: GamePhase;
  maxPlayers: number;
  players: PublicPlayer[];
  currentPlayerId: string;
  /** O sorteado, enquanto a roleta gira. Vazio fora do sorteio. */
  starterId: string;
  /** Quantas cartas sobraram no monte. */
  deckCount: number;
  /** O tamanho do centro inteiro; `centre` só carrega a ponta visível. */
  centreCount: number;
  /** As cartas da VAZA em disputa, na ordem em que foram baixadas. */
  centre: PublicCard[];
  /** O campeão. Vazio quando não há um: ninguém de pé, ou empate. */
  winnerId: string;
  /** Quem venceu. Um nome de costume, vários no empate, nenhum sem campeão. */
  winnerIds: string[];
  log: string[];

  /* --- a partida --- */
  stage: MatchStage;
  /** A rodada, contada a partir de 1. */
  round: number;
  /** Quantas cartas cada um recebeu nesta rodada. */
  cardsPerPlayer: number;
  /** O teto de cartas por rodada combinado na criação; `0` é sem teto. */
  maxCards: number;
  /** Com quantos pontos esta mesa começou. Ver `STARTING_POINTS`. */
  startingPoints: number;
  dealerId: string;
  /** A vaza em disputa, contada a partir de 1. */
  trickNumber: number;
  /** A rodada às cegas: cada um vê a mão dos outros, e não a sua. */
  blind: boolean;
  /** A soma das promessas já declaradas. */
  promised: number;
  /** Quem levou a última vaza fechada. Vazio antes da primeira. */
  lastTrickWinnerId: string;
  /** O placar da rodada, enquanto ele está na tela. Vazio fora dele. */
  results: RoundResult[];
  /** As regras da casa desta mesa. Escolhidas na criação, fixas até o fim. */
  cangar: boolean;
  porcao: boolean;
};

export const toCard = (card: PublicCard): Card => ({
  id: card.id,
  suit: card.suit,
  rank: card.rank,
});

/**
 * A chave da cadeira: quem você é para esta mesa.
 *
 * O Colyseus já tem um token de reconexão, e ele não basta — o servidor o TROCA
 * a cada reconexão, e a aba que morre entre a troca e a gravação no
 * localStorage fica com uma chave morta na mão, trancada do lado de fora da
 * própria cadeira. Esta aqui nasce no navegador, não muda nunca e vale
 * enquanto a cadeira estiver guardada.
 *
 * É uma credencial ao portador, como o token: quem a tem senta na cadeira dela.
 * Por isso é sorteada, nunca derivada do nome, e nunca aparece na tela.
 */
export type CreateRoomOptions = {
  roomName: string;
  playerName: string;
  maxPlayers: number;
  seatKey: string;
  /**
   * O teto de cartas por rodada. Ausente ou `0` é o que o baralho der — que é
   * como o jogo sempre foi. Ver `maxHandSize`.
   */
  maxCards?: number;
  /**
   * Com quantos pontos todo mundo senta. Ausente ou fora da faixa é
   * `STARTING_POINTS`. Ver `MAX_STARTING_POINTS`.
   */
  startingPoints?: number;
  /** Ver `HouseRules`. Ausente é a mesa sem regra opcional nenhuma. */
  cangar?: boolean;
  porcao?: boolean;
};

export type JoinRoomOptions = {
  playerName: string;
  seatKey: string;
};

/** cliente -> servidor */
export type PlayMessage = { cardId: string };
export type PromiseMessage = { promise: number };
export type EmoteMessage = { emote: Emote };

/** A mão de um adversário, aberta para você. Só existe na rodada às cegas. */
export type PeekedHand = { playerId: string; cards: Card[] };

/**
 * servidor -> cliente, privado de um jogador só.
 *
 * `hiddenIds` é o que faz a rodada às cegas ser uma limitação de verdade e não
 * um verso de carta desenhado por cima: a carta está na sua mão, você pode
 * jogá-la, e o servidor NÃO te contou qual é. O naipe e o valor dela só entram
 * neste envelope depois de ela cair na mesa.
 */
export type HandMessage = {
  cards: Card[];
  hiddenIds: string[];
  playableIds: string[];
  /** As mãos dos outros, na rodada às cegas. Vazio no resto da partida. */
  peek: PeekedHand[];
  /** As promessas que você pode declarar agora. Vazio fora da sua vez. */
  promises: number[];
};
export type ErrorMessage = { message: string };

/**
 * O que ACONTECEU, e não o que passou a ser — o estado sincronizado só conta o
 * segundo. Sem isto o cliente teria que adivinhar por diferença de contadores,
 * e há jogadas em que a diferença mente: comprar e jogar dentro do mesmo patch
 * devolve o contador da mão ao que era.
 *
 * A mesa usa isso só para animar. Nenhuma regra depende destes eventos.
 */
export type FxEvent =
  /** Reparto inicial: n cartas do monte para a mão de `to`. */
  | { k: "deal"; to: string; n: number }
  /** `to` comprou n cartas do monte. */
  | { k: "draw"; to: string; n: number }
  /** `by` baixou uma carta: a última do centro, que já vem no estado. */
  | { k: "play"; by: string }
  /** A vaza fechou. `winner` vazio é a vaza que se anulou e não foi de ninguém. */
  | { k: "trick"; winner: string };

/** servidor -> cliente, para todos. Vem antes do patch de estado correspondente. */
export type FxMessage = FxEvent[];

/**
 * servidor -> cliente, para todos. Quem falou e o que disse.
 *
 * Fora do estado sincronizado pelo mesmo motivo dos eventos de `fx`: um emoji
 * é o que ACONTECEU, e some sozinho. No schema ele obrigaria a mesa inteira a
 * receber um patch para pôr o balão e outro para tirá-lo — e ainda ressuscitaria
 * na tela de quem entrasse depois, comentando uma jogada que já passou.
 */
export type EmoteEvent = { by: string; emote: Emote };
