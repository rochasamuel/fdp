import { create } from "zustand";
import { playSound, VOLUME } from "../lib/sound";
import { currentBackUrl, isLowMotion } from "../store/ui";

/**
 * O voo de uma carta entre dois pontos da mesa.
 *
 * Duas metades: aqui ficam as âncoras (quem está onde, medido no DOM real) e a
 * lista do que está no ar; em `FlightLayer.tsx` fica o desenho. O que liga as
 * duas é `launch`, que mede as pontas no instante do disparo — nada de
 * coordenadas guardadas, que envelhecem a cada redimensionamento da janela.
 *
 * A regra que governa o arquivo inteiro: **uma carta faz UM movimento**. Ela
 * parte de onde estava e pousa exatamente na pose final — mesma posição, mesmo
 * ângulo, mesmo tamanho que ela terá parada. Onde o voo termina, nada mais se
 * mexe. É por isso que `launch` recebe uma pose de chegada em vez de só um
 * ponto, e por isso que quem espera a carta não a reanima ao mostrá-la.
 */

/** Entre cartas de uma mesma compra: dá para contar as 4 do +4. */
const STAGGER = 70;
/** No reparto inicial, uma de cada vez, jogador a jogador — como se distribui. */
const DEAL_STAGGER = 55;
/** Entre as cartas da mão fechada varrendo a mesa: um monte, e não uma fila. */
const TRICK_SWEEP = 35;
/**
 * O teto de batidas do reparto. Uma por carta sua enquanto elas couberem aqui.
 *
 * Uma mesa de dois chega a 26 cartas na mão, e vinte e seis toques seguidos
 * deixam de ser um baralho sendo repartido para virar uma metralhadora. Daqui
 * para cima a batida rareia — uma a cada N cartas, espalhada pelo reparto
 * inteiro —, e o que se ouve continua sendo o RITMO, que é o que a orelha
 * reconhece, e não a contagem.
 */
const DEAL_BEATS = 12;
/**
 * O reparto soa mais baixo que uma carta baixada, e de propósito: são doze
 * toques seguidos contra um, e no mesmo volume eles mandariam na mesa. É pano
 * de fundo — o baralho na mão de quem reparte, e não uma carta batendo na mesa.
 */
const DEAL_VOLUME = VOLUME * 0.55;
/**
 * Abaixo desta distância o voo é um deslize, não um arremesso: sem arco e mais
 * curto. É o caso de soltar a carta em cima do descarte — ela já está lá, e
 * fazê-la subir antes de assentar seria inventar um movimento que ninguém pediu.
 */
const NEAR_PX = 150;
/** Quanto a carta encolhe ao entrar num assento, que mostra cartas em miniatura. */
const SEAT_SCALE = 0.22;
/**
 * Sobrevida da sua própria carta depois de pousar. Ela parte no clique, antes
 * de o servidor confirmar, então pode chegar ao descarte antes de existir nele.
 * Como o voo termina exatamente na pose de repouso, ficar parada ali um pouco
 * mais é invisível — e é o que cobre a ida e volta numa conexão preguiçosa.
 */
const SETTLE_MS = 140;

/* ------------------------------------------------------------------ âncoras */

export type AnchorKey = "draw" | "centre" | "hand" | `seat:${string}`;

const anchors = new Map<AnchorKey, HTMLElement>();
const refs = new Map<AnchorKey, (el: HTMLElement | null) => void>();

/**
 * Ref callback estável por chave: uma nova função a cada render faria o React
 * desregistrar e registrar a âncora em todo ciclo, de graça.
 */
export function anchorRef(key: AnchorKey) {
  let ref = refs.get(key);
  if (!ref) {
    ref = (el: HTMLElement | null) => {
      if (el) anchors.set(key, el);
      else anchors.delete(key);
    };
    refs.set(key, ref);
  }
  return ref;
}

/** Onde a carta para, e em que pose. `x`/`y` são o centro dela, em viewport. */
export type Pose = { x: number; y: number; rot: number; scale: number };

const poseOf = (box: DOMRect, rot = 0, scale = 1): Pose => ({
  x: box.left + box.width / 2,
  y: box.top + box.height / 2,
  rot,
  scale,
});

function center(key: AnchorKey, rot = 0, scale = 1): Pose | null {
  const box = anchors.get(key)?.getBoundingClientRect();
  if (!box || box.width === 0) return null;
  return poseOf(box, rot, scale);
}

/**
 * O ângulo com que um slot do leque está inclinado, lido da matriz que o
 * navegador realmente aplicou. Sem isto a carta pousaria na horizontal e
 * saltaria para a inclinação do leque no quadro seguinte.
 */
/** Inclinação e ampliação que o navegador de fato aplicou a um elemento. */
function transformOf(element: Element) {
  const { transform } = getComputedStyle(element);
  if (!transform || transform === "none") return { rot: 0, scale: 1 };
  const { a, b } = new DOMMatrixReadOnly(transform);
  return { rot: (Math.atan2(b, a) * 180) / Math.PI, scale: Math.hypot(a, b) || 1 };
}

const angleOf = (element: Element) => transformOf(element).rot;

/**
 * A pose de uma carta que está na tela agora, para um voo continuar de onde ela
 * parou. Compõe a do elemento com a do de fora, porque é assim que o leque é
 * feito: o `li` gira, e a carta dentro dele translada e amplia.
 *
 * Sem a inclinação, uma carta clicada na ponta do leque daria um tranco de
 * dezoito graus antes de sair. Sem a ampliação, toda carta encolheria 6% no
 * instante em que o dedo a solta — que é justamente o instante em que se está
 * olhando para ela.
 */
export function poseOfCard(element: Element): Pose {
  const own = transformOf(element);
  const outer = element.parentElement
    ? transformOf(element.parentElement)
    : { rot: 0, scale: 1 };
  return poseOf(element.getBoundingClientRect(), own.rot + outer.rot, own.scale * outer.scale);
}

/**
 * Onde no leque a carta vai pousar.
 *
 * Se o lugar dela já existe no DOM — é o caso do reparto, em que as sete cartas
 * chegam juntas e ficam invisíveis esperando —, mira nele, inclinação inclusa.
 * Sem isso as sete voariam todas para a mesma ponta e apareceriam espalhadas.
 *
 * Quando o lugar ainda não existe — a compra do turno, anunciada antes de a mão
 * chegar —, vale a ponta direita: é por lá que uma carta comprada entra, porque
 * o servidor faz `hand.push`. O ângulo vem da última carta que existe, que é a
 * vizinha da que está chegando.
 *
 * A base é o `bottom` da caixa: o topo é a folga reservada para o hover.
 */
function handSlot(cardWidth: number, index?: number): Pose | null {
  const hand = anchors.get("hand");
  const box = hand?.getBoundingClientRect();
  if (!hand || !box || box.width === 0) return null;

  const slot = index === undefined ? undefined : hand.children[index];
  if (slot) return poseOf(slot.getBoundingClientRect(), angleOf(slot));

  const last = hand.children[hand.children.length - 1];
  return {
    x: box.right - cardWidth / 2,
    y: box.bottom - (cardWidth * 3) / 4,
    rot: last ? angleOf(last) : 0,
    scale: 1,
  };
}

/* -------------------------------------------------------------------- store */

export type Flight = {
  id: number;
  /** Canto superior esquerdo da partida, em coordenadas de viewport. */
  x: number;
  y: number;
  width: number;
  dx: number;
  dy: number;
  rot: number;
  /** Ampliação na partida e na chegada: o voo continua a pose que já estava lá. */
  lift: number;
  scale: number;
  delay: number;
  ms: number;
  /** Trecho curto: desliza em vez de arremessar. */
  near: boolean;
  art: string;
};

/** Quem espera esta carta pousar antes de mostrá-la. */
type Hold = { kind: "hand" } | { kind: "centre"; id: string } | null;

type FlightsStore = {
  flights: Flight[];
  /** Cartas do FIM da sua mão que ainda estão no ar. */
  heldHand: number;
  /**
   * Cartas do centro que ainda estão no ar, por id. Por id, e não por
   * contagem: a sua própria jogada parte no clique, antes de o servidor
   * confirmar, então a carta é conhecida pelo nome muito antes de existir na
   * pilha — e uma contagem, nessa hora, esconderia a carta errada.
   */
  heldCentre: Set<string>;
  /**
   * A carta que você acabou de jogar. Sai do leque na hora, sem esperar a mão
   * nova chegar do servidor: é o voo que a representa daqui em diante, e vê-la
   * voltar para o leque antes de partir era o pior salto de todos.
   */
  leaving: string | null;
};

export const useFlightStore = create<FlightsStore>(() => ({
  flights: [],
  heldHand: 0,
  heldCentre: new Set(),
  leaving: null,
}));

let nextId = 1;
const timers = new Set<ReturnType<typeof setTimeout>>();

/** Até quando o monte de compra está ocupado, para o que vem depois esperar a vez. */
let busyUntil = 0;

/* O sistema ou a chave da mesa: ver `isLowMotion` no store/ui. */
const reduced = isLowMotion;

function hold(kind: Hold, taking: boolean) {
  if (!kind) return;
  const delta = taking ? 1 : -1;
  useFlightStore.setState((state) => {
    if (kind.kind === "hand") return { heldHand: Math.max(0, state.heldHand + delta) };
    const held = new Set(state.heldCentre);
    if (taking) held.add(kind.id);
    else held.delete(kind.id);
    return { heldCentre: held };
  });
}

/**
 * Trechos longos são arremessos e trechos curtos são deslizes. Um único tempo
 * para os dois faz a carta que atravessa a mesa parecer apressada e a que já
 * está no destino parecer preguiçosa.
 */
function timing(dx: number, dy: number) {
  const distance = Math.hypot(dx, dy);
  return {
    ms: Math.round(Math.min(460, 200 + distance * 0.42)),
    near: distance < NEAR_PX,
  };
}

type LaunchOptions = {
  from: Pose | null;
  to: Pose | null;
  width: number;
  art: string;
  delay: number;
  holds: Hold;
  /** Tempo parado na pose final antes de sumir. Ver SETTLE_MS. */
  settle?: number;
};

function launch({ from, to, width, art, delay, holds, settle = 0 }: LaunchOptions) {
  // Sem as duas pontas não há voo — e sem voo não pode haver espera, senão a
  // carta ficaria escondida para sempre.
  if (!from || !to) return;

  const id = nextId++;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const { ms, near } = timing(dx, dy);

  const flight: Flight = {
    id,
    x: from.x - width / 2,
    y: from.y - (width * 3) / 4,
    width,
    dx,
    dy,
    rot: to.rot - from.rot,
    lift: from.scale,
    scale: to.scale,
    delay,
    ms,
    near,
    art,
  };

  hold(holds, true);
  useFlightStore.setState((state) => ({ flights: [...state.flights, flight] }));

  const timer = setTimeout(() => {
    timers.delete(timer);
    hold(holds, false);
    useFlightStore.setState((state) => ({
      flights: state.flights.filter((item) => item.id !== id),
    }));
  }, delay + ms + settle);
  timers.add(timer);

  return delay + ms;
}

/** Largura da carta, tirada da própria mesa em vez de recalculada do CSS. */
function cardWidth() {
  const box = anchors.get("draw")?.getBoundingClientRect();
  return box && box.width > 0 ? box.width : 96;
}

/**
 * A pose de uma carta que ainda está no leque, medida agora.
 *
 * Serve a toda jogada que passa por um passo a mais entre o clique e o envio:
 * nesse tempo o ponteiro saiu da carta e ela desceu os 32px do hover, e a pose
 * do clique já não vale. A do envio, sim.
 */
export const handCardPose = (index: number) => handSlot(cardWidth(), index);

/* ------------------------------------------------------------------ disparos */

/** Cartas saindo do monte para uma mão ou para um assento. */
export function flyDraw(options: {
  toSeat: string | null;
  count: number;
  delay?: number;
  step?: number;
  /** Posição no leque, quando ela já se conhece. Ver `handSlot`. */
  atIndex?: number;
}) {
  if (reduced()) return;
  const { toSeat, count } = options;
  const step = options.step ?? STAGGER;
  const base = options.delay ?? 0;
  const width = cardWidth();
  const from = center("draw");
  const to = toSeat
    ? center(`seat:${toSeat}`, 0, SEAT_SCALE)
    : handSlot(width, options.atIndex);
  // Nada espera a carta que vai para um assento: o assento não conta cartas.
  // Só a SUA mão precisa segurar a carta até ela pousar.
  const holds: Hold = toSeat ? null : { kind: "hand" };

  for (let i = 0; i < count; i++) {
    const ends = launch({ from, to, width, art: currentBackUrl(), delay: base + i * step, holds });
    if (ends) busyUntil = Math.max(busyUntil, performance.now() + ends);
  }
}

/**
 * O baralho sendo repartido: a mesma batida da carta baixada, repetida. Uma só
 * no começo não diria nada — o que faz a orelha reconhecer um reparto é a
 * REPETIÇÃO.
 *
 * Uma batida por carta SUA, e não por carta da mesa: o que interessa a quem
 * ouve é o próprio bolo chegando, que é o que ele vai ter na mão. Até o teto —
 * ver `DEAL_BEATS`.
 *
 * Os relógios são os mesmos dos voos, então `clearFlights` cancela o que ainda
 * não soou: uma revanche não carrega o reparto da partida anterior.
 */
function dealBeat(cards: number) {
  const beats = Math.min(cards, DEAL_BEATS);
  // De quantas em quantas cartas sai um toque. Um por carta na rodada de cinco,
  // um a cada duas na de vinte e seis — e o reparto dura o mesmo dos dois lados.
  const every = beats > 0 ? cards / beats : 0;
  for (let i = 0; i < beats; i++) {
    const timer = setTimeout(
      () => {
        timers.delete(timer);
        playSound("play", DEAL_VOLUME);
      },
      Math.round(i * every) * DEAL_STAGGER,
    );
    timers.add(timer);
  }
}

/**
 * A mão fechada indo embora: as cartas do centro varrem a mesa até quem levou.
 *
 * Viradas para baixo, e não com a cara à mostra. A disputa acabou no instante
 * em que a vencedora foi apontada; o que voa daqui em diante já não é carta
 * jogável, é o BOLO — e é justamente o gesto que a mesa de verdade faz para
 * dizer de quem ele foi. Quem viu as cartas as viu pelo tempo do `TRICK_LINGER`,
 * paradas na mesa, que é para isso que a pausa existe.
 *
 * `null` é você, que não tem assento: o bolo vem para o seu lado da mesa.
 *
 * O escalonamento é curto de propósito. Não se está contando carta por carta —
 * se está vendo um monte ser recolhido —, e o que separa as duas leituras é o
 * intervalo entre uma e a seguinte.
 */
export function flyTrick(toSeat: string | null, count: number) {
  if (reduced() || count <= 0) return;
  const width = cardWidth();
  const from = center("centre");
  const to = toSeat
    ? center(`seat:${toSeat}`, 0, SEAT_SCALE)
    : // O leque sem carta nenhuma não tem largura para medir, e é exatamente o
      // caso da ÚLTIMA mão da rodada — a que decide tudo. Sem esta saída, a
      // única mão que ninguém quer perder de vista seria a única sem o gesto.
      (center("hand", 0, SEAT_SCALE) ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight - cardWidth(),
        rot: 0,
        scale: SEAT_SCALE,
      });

  for (let i = 0; i < count; i++) {
    launch({
      from,
      to,
      width,
      art: currentBackUrl(),
      delay: i * TRICK_SWEEP,
      // Nada espera este voo: o centro já está vazio no estado, e o bolo não
      // vira contador em canto nenhum. Ele é só o gesto.
      holds: null,
    });
  }
}

/**
 * O reparto inicial. Os eventos chegam agrupados por jogador, mas ninguém
 * distribui sete cartas para um e depois sete para o outro: o atraso de cada
 * carta é calculado em rodadas, uma volta na mesa por vez.
 */
export function flyDeal(hands: { seat: string | null; count: number }[]) {
  // O som antes do `reduced`: quem desligou o movimento não desligou o som, e
  // sem os voos ele é a única coisa que diz que a mesa está repartindo.
  // `seat: null` é você — ver `flyDraw`.
  dealBeat(hands.find((entry) => entry.seat === null)?.count ?? 0);
  if (reduced()) return;
  for (const [index, entry] of hands.entries()) {
    for (let round = 0; round < entry.count; round++) {
      flyDraw({
        toSeat: entry.seat,
        count: 1,
        delay: (round * hands.length + index) * DEAL_STAGGER,
        atIndex: round,
      });
    }
  }
}

/** De onde uma carta baixada parte. */
export type PlaySource =
  /** Do assento de outro jogador. */
  | { kind: "seat"; id: string }
  /** Do seu leque, da pose exata em que a sua mão a soltou. */
  | { kind: "me"; from: Pose }
  /** Do monte: a carta que abre a partida. */
  | { kind: "deck" };

/**
 * Uma carta baixada, indo parar no centro da mesa.
 *
 * `landing` é a pose exata que a carta terá parada na pilha — o mesmo
 * espalhamento que o `CentrePile` calcula. Voar até o centro e deixar o
 * espalhamento acontecer depois custaria um pulo de uns quinze pixels e cinco
 * graus, no quadro seguinte ao pouso.
 */
export function flyPlay(
  source: PlaySource,
  card: { id: string; art: string },
  landing: { rot: number; dx: number; dy: number },
) {
  if (reduced()) return;
  const width = cardWidth();
  const height = (width * 3) / 2;

  const centre = center("centre");
  const to = centre && {
    // dx/dy vêm em porcentagem da própria carta, como o CSS do centro os usa.
    x: centre.x + (landing.dx / 100) * width,
    y: centre.y + (landing.dy / 100) * height,
    rot: landing.rot,
    scale: 1,
  };

  const from =
    source.kind === "seat"
      ? center(`seat:${source.id}`, 0, SEAT_SCALE)
      : source.kind === "deck"
        ? center("draw")
        : source.from;

  launch({
    from,
    to,
    width,
    art: card.art,
    // A virada inicial só acontece depois de todo mundo receber as suas.
    delay: source.kind === "deck" ? Math.max(0, busyUntil - performance.now()) : 0,
    // Só a sua carta corre na frente do servidor e precisa esperar por ele.
    settle: source.kind === "me" ? SETTLE_MS : 0,
    holds: { kind: "centre", id: card.id },
  });
}

/**
 * A carta sai do leque agora, sem esperar a mão nova chegar do servidor.
 *
 * O prazo só existe para o caso de a jogada ser recusada — aí não vem mão nova
 * nenhuma, e sem ele a carta ficaria sumida para sempre. Quando a jogada vale,
 * a mão nova chega antes e já não tem essa carta: o prazo não muda nada.
 */
export function markLeaving(cardId: string) {
  useFlightStore.setState({ leaving: cardId });
  const timer = setTimeout(() => {
    timers.delete(timer);
    useFlightStore.setState((state) =>
      state.leaving === cardId ? { leaving: null } : state,
    );
  }, 900);
  timers.add(timer);
}

/** Cancela tudo o que está no ar e devolve as cartas seguradas. */
export function clearFlights() {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  busyUntil = 0;
  useFlightStore.setState({
    flights: [],
    heldHand: 0,
    heldCentre: new Set(),
    leaving: null,
  });
}
