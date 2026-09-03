import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cardLabel, type Card } from "@fdp/shared";
import { anchorRef, poseOfCard, useFlightStore, type Pose } from "../game/flights";
import { artUrl, backUrl } from "../lib/cards";
import { useUi } from "../store/ui";
import { useDragCard, type Point } from "../lib/useDragCard";
import { useMediaQuery } from "../lib/useMediaQuery";
import { applyOrder } from "../game/handOrder";

/**
 * Uma posição no leque. `card` é `null` quando a carta está na sua mão e você
 * NÃO sabe qual é — a rodada às cegas. Ela é jogável do mesmo jeito: o id
 * basta para mandar a jogada, e é só isso que o servidor mandou.
 */
export type HandEntry = { id: string; card: Card | null };

const SPREAD = 6; // degrees between neighbours
const MAX_FAN = 36; // total opening; acima disso as pontas giram para fora da tela
const ARC = 10; // px the ends drop

/**
 * Quanto o gesto pode sair do leque, para cima ou para baixo, e ainda contar
 * como "arruma a mão". A carta arrastada sobe enquanto se move; largá-la no
 * meio da mesa, longe do leque, é desistir do gesto e não trocá-la de lugar.
 */
const REORDER_REACH = 96;

/** A carta que está sendo arrastada e a vizinha cujo lugar ela vai tomar. */
type Preview = { id: string; target: string };

/** O leque como ele estava quando o gesto começou. Ver `frozen` no `Hand`. */
type Frozen = { top: number; bottom: number; slots: { id: string; centre: number }[] };

/** Uma posição desenhada: uma carta de verdade, ou a silhueta do destino. */
type Slot = { entry: HandEntry; ghost: boolean };

/**
 * O leque com a silhueta no meio.
 *
 * A carta arrastada NÃO sai da lista: é ela que o ponteiro está carregando, e
 * tirá-la daqui arrancaria de baixo do cursor o elemento que se move com ele.
 * O que ela deixa para trás é o próprio lugar, aberto e vazio, e o que ganha é
 * uma segunda posição — a silhueta — onde ela vai parar. De que lado da vizinha
 * a silhueta entra é a mesma leitura do `moveCard`: vindo da esquerda ela fica
 * depois do alvo, vindo da direita, antes.
 */
function withGhost(cards: HandEntry[], preview: Preview | null): Slot[] {
  const slots = cards.map((entry) => ({ entry, ghost: false }));
  if (!preview) return slots;

  const from = cards.findIndex((entry) => entry.id === preview.id);
  const to = cards.findIndex((entry) => entry.id === preview.target);
  if (from < 0 || to < 0 || from === to) return slots;

  slots.splice(from < to ? to + 1 : to, 0, { entry: cards[from], ghost: true });
  return slots;
}

/**
 * Quantas larguras de carta a mão ocupa, no pior caso: a caixa do leque já com
 * o recobrimento máximo de 84%, mais o balanço das cartas giradas nas pontas
 * (0,878 de largura no total, medido com a abertura travada em MAX_FAN). O CSS
 * usa o recíproco disso para saber até onde pode encolher a carta.
 */
const handSpan = (count: number) => 1.878 + 0.16 * Math.max(0, count - 1);

type Props = {
  cards: HandEntry[];
  playableIds: Set<string>;
  yourTurn: boolean;
  dropTarget: RefObject<HTMLElement | null>;
  /** `from` é a pose em que a carta saiu da mão: de lá parte a animação. */
  onPlay: (cardId: string, from: Pose) => void;
  onDragOver: (over: boolean) => void;
  /** A ordem em que você deixou as cartas. Ver `useHandOrder`. */
  order: string[];
  /** A carta `cardId` foi solta em cima da `targetId`, e toma o lugar dela. */
  onReorder: (cardId: string, targetId: string) => void;
};

export function Hand({
  cards: dealt,
  playableIds,
  yourTurn,
  dropTarget,
  onPlay,
  onDragOver,
  order,
  onReorder,
}: Props) {
  /*
   * A carta que você acabou de jogar já saiu, mesmo que a mão nova ainda esteja
   * a caminho do servidor. Quem a representa daqui em diante é o voo; deixá-la
   * no leque por mais 100ms fazia ela voltar para o lugar e sair de novo.
   */
  const leaving = useFlightStore((state) => state.leaving);
  const inHand = leaving ? dealt.filter((entry) => entry.id !== leaving) : dealt;

  /*
   * As cartas compradas entram sempre pelo fim do leque — o servidor faz
   * `hand.push` — então as que ainda estão no ar são as últimas. Elas já ocupam
   * o lugar delas, invisíveis: reservar o espaço antes é o que faz o leque
   * parar de abrir e fechar a cada compra, e é também o que dá ao voo um alvo
   * fixo para mirar.
   */
  const airborne = useFlightStore((state) => state.heldHand);
  // A ordem escolhida entra AQUI, e não lá no `Table`, porque só daqui se vê
  // quantas cartas ainda estão no ar — e elas ficam no fim, fora da ordem.
  const cards = applyOrder(inHand, order, airborne);
  const shown = Math.max(0, cards.length - airborne);
  const fresh = useFreshCards(cards.slice(0, shown));
  // Por id e não por posição: a silhueta desloca os índices do leque enquanto
  // o gesto dura, e quem está no ar continua sendo quem estava.
  const airborneIds = new Set(cards.slice(shown).map((entry) => entry.id));

  const [armed, setArmed] = useArmedCard(playableIds);
  /*
   * O segundo toque vale onde o dedo escorrega, e não onde a pessoa escolheu
   * uma chave: no mouse a carta não sai sem querer, e o passo a mais só
   * atrapalharia. A chave dos ajustes é o outro lado do E — ver `confirmPlay`
   * no `store/ui.ts`, e a chave em si no `ConfigMenu`.
   */
  const coarse = useMediaQuery("(pointer: coarse)");
  const needsConfirm = useUi((ui) => ui.confirmPlay) && coarse;

  const list = useRef<HTMLUListElement>(null);
  const attach = useCallback((element: HTMLUListElement | null) => {
    list.current = element;
    anchorRef("hand")(element);
  }, []);

  /*
   * Arrumar as cartas na mão é gesto de computador. No celular a mão inteira
   * cabe num punhado de pixels e o dedo cobre três cartas de uma vez: arrastar
   * para o lado ali acertaria a vizinha na metade das tentativas. Quem joga no
   * telefone ordena pelos ajustes, que é o mesmo resultado sem a mira.
   */
  const fine = useMediaQuery("(pointer: fine)");
  const canReorder = fine && cards.length > 1;
  /** Onde a carta arrastada vai cair. É a silhueta que se vê no leque. */
  const [preview, setPreview] = useState<Preview | null>(null);

  /*
   * O leque medido no instante em que o gesto começou, e não a cada movimento.
   *
   * Ele MUDA durante o arraste: a silhueta abre um lugar e empurra as cartas
   * para o lado. Medir de novo depois disso é perguntar ao leque de mentira
   * onde o ponteiro está — a resposta muda, a silhueta salta para a casa
   * vizinha, e o novo leque devolve a primeira resposta. As cartas piscam
   * entre duas posições e nenhuma delas é a que vale. Congelar o leque de
   * antes é o que dá ao gesto um chão parado para mirar.
   */
  const frozen = useRef<Frozen | null>(null);

  const freeze = () => {
    const box = list.current?.getBoundingClientRect();
    if (!box) return null;
    const slots: { id: string; centre: number }[] = [];
    for (const slot of list.current!.children) {
      const id = (slot as HTMLElement).dataset.cardId;
      if (!id) continue;
      const seat = slot.getBoundingClientRect();
      slots.push({ id, centre: (seat.left + seat.right) / 2 });
    }
    return { top: box.top, bottom: box.bottom, slots };
  };

  /*
   * Em cima de qual carta o ponteiro está. Pelo CENTRO de cada slot, e não por
   * quem contém o ponto: as cartas se recobrem em até 84%, então metade dos
   * pontos do leque cai dentro de duas cartas ao mesmo tempo — a mais próxima
   * é a resposta que não depende de qual delas o navegador encontra primeiro.
   */
  const targetAt = (point: Point) => {
    const map = (frozen.current ??= freeze());
    if (!map) return null;
    // A carta arrastada sobe e endireita; a folga é para o gesto que sai um
    // pouco do leque ainda contar. Largar longe da mão não arruma nada.
    if (point.y < map.top - REORDER_REACH || point.y > map.bottom + REORDER_REACH) return null;

    let nearest: string | null = null;
    let distance = Infinity;
    for (const slot of map.slots) {
      const gap = Math.abs(slot.centre - point.x);
      if (gap < distance) {
        distance = gap;
        nearest = slot.id;
      }
    }
    return nearest;
  };

  const over = useCallback(
    (cardId: string, hit: boolean, point: Point) => {
      onDragOver(hit);
      // Ponto fora da tela é o fim do gesto — ver OFFSCREEN no `useDragCard`.
      // O leque volta a ser medível, e a silhueta some.
      if (point.x < 0) {
        frozen.current = null;
        setPreview(null);
        return;
      }
      // Sobre o descarte a carta vai ser jogada, e não arrumada: um alvo de
      // cada vez, senão os dois se acendem e nenhum dos dois é a resposta.
      const target = canReorder && !hit ? targetAt(point) : null;
      setPreview(target && target !== cardId ? { id: cardId, target } : null);
    },
    [canReorder, onDragOver],
  );

  /*
   * A carta cai no lugar novo com o ponteiro ainda em cima dela. O hover a
   * levantaria de volta para cima do leque inteiro — a resposta do gesto
   * tapada pelo próprio ponteiro que a pediu. O realce volta assim que a mão
   * se mexe: um movimento de verdade é a pessoa olhando para outra carta, e aí
   * o hover é o que ela quer. Ver `.is-settling` no index.css.
   */
  const [justDropped, setJustDropped] = useState(false);
  useEffect(() => {
    if (!justDropped) return;
    const wake = () => setJustDropped(false);
    document.addEventListener("pointermove", wake, { once: true });
    return () => document.removeEventListener("pointermove", wake);
  }, [justDropped]);

  /*
   * A silhueta é a promessa, e soltar a cumpre: o destino é o que estava na
   * tela, e não uma conta refeita sobre o leque já aberto pela própria
   * silhueta. Por isso o `useDragCard` avisa a soltura ANTES de encerrar o
   * gesto.
   */
  const reorder = useCallback(
    (cardId: string) => {
      if (preview?.id !== cardId) return;
      onReorder(cardId, preview.target);
      setJustDropped(true);
    },
    [onReorder, preview],
  );


  /*
   * O leque como ele vai ficar: a carta arrastada deixa o lugar dela aberto e
   * ganha uma silhueta no destino. São dois lugares no leque para a mesma
   * carta durante o gesto — o vão de onde ela saiu e o vão para onde ela vai —,
   * e é essa a resposta que faltava a quem arrasta.
   */
  const view = withGhost(cards, preview);
  const middle = (view.length - 1) / 2;
  const spread = Math.min(SPREAD, MAX_FAN / Math.max(1, view.length - 1));

  return (
    <ul
      ref={attach}
      className={justDropped ? "fdp-hand is-settling" : "fdp-hand"}
      aria-label="Sua mão"
      // O CSS aperta o leque conforme a mão cresce, para ele nunca passar da
      // largura da janela. Ver --pull em index.css.
      style={{
        "--cards": view.length,
        "--gaps-r": 1 / Math.max(1, view.length - 1),
        "--fit-r": 1 / handSpan(view.length),
      } as React.CSSProperties}
    >
      {view.map((slot, index) => {
        const fromMiddle = index - middle;
        const normalized = middle === 0 ? 0 : fromMiddle / middle;
        const entry = slot.entry;
        return (
          <li
            key={slot.ghost ? "ghost" : entry.id}
            // A silhueta NÃO se anuncia como carta: ela não é alvo de nada, e
            // deixar o id aqui faria a mira do gesto enxergar duas vezes a
            // mesma carta. Ver `freeze`.
            data-card-id={slot.ghost ? undefined : entry.id}
            className={slot.ghost ? "fdp-slot is-ghost" : "fdp-slot"}
            style={{
              // the arc is parabolic: flat in the middle, dropping at the ends
              "--angle": `${fromMiddle * spread}deg`,
              "--drop-y": `${normalized * normalized * ARC}px`,
            } as React.CSSProperties}
          >
            {slot.ghost ? (
              <Ghost entry={entry} />
            ) : (
              <HandCard
                entry={entry}
                playable={playableIds.has(entry.id)}
                dimmed={yourTurn && !playableIds.has(entry.id)}
                isNew={fresh.has(entry.id)}
                airborne={airborneIds.has(entry.id)}
                armed={armed === entry.id}
                needsConfirm={needsConfirm}
                onArm={setArmed}
                dropTarget={dropTarget}
                onPlay={onPlay}
                onOver={over}
                onReorder={reorder}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

type CardProps = {
  entry: HandEntry;
  playable: boolean;
  dimmed: boolean;
  isNew: boolean;
  /** Ainda a caminho: guarda o lugar no leque, mas não se mostra. */
  airborne: boolean;
  /** De pé, esperando o segundo toque. */
  armed: boolean;
  /** O toque arma em vez de jogar. */
  needsConfirm: boolean;
  onArm: (cardId: string | null) => void;
  dropTarget: RefObject<HTMLElement | null>;
  onPlay: (cardId: string, from: Pose) => void;
  onOver: (cardId: string, hit: boolean, point: Point) => void;
  /** Soltou fora do descarte: a carta vai para onde a silhueta estava. */
  onReorder: (cardId: string) => void;
};

function HandCard({
  entry,
  playable,
  dimmed,
  isNew,
  airborne,
  armed,
  needsConfirm,
  onArm,
  dropTarget,
  onPlay,
  onOver,
  onReorder,
}: CardProps) {
  const element = useRef<HTMLButtonElement>(null);
  const back = useUi((ui) => ui.back);

  /*
   * Clicar joga; arrastar até o descarte joga. Os dois caminhos chamam o mesmo
   * onPlay, e é o servidor que decide se a jogada vale.
   *
   * `direct` é o gesto que dispensa a confirmação: o arraste, que atravessa
   * meia tela, e o teclado, que já foi até a carta com o Tab. O que escorrega
   * é o toque, e é dele que o segundo passo protege — o primeiro toque põe a
   * carta de pé, o segundo a manda.
   */
  const resolve = (played: boolean, from: Pose, direct = false) => {
    if (!played || !playable) return;
    if (needsConfirm && !direct && !armed) {
      onArm(entry.id);
      return;
    }
    onPlay(entry.id, from);
  };

  /*
   * Soltar a carta fora do descarte era não fazer nada; agora é arrumar a mão.
   * Os dois destinos do mesmo arraste, decididos pelo lugar onde ela caiu — e
   * o clique, que chega aqui com `dragged` falso, continua sendo jogada.
   */
  const drag = useDragCard(
    dropTarget,
    (played, from, dragged) => {
      if (dragged && !played) return onReorder(entry.id);
      resolve(played, from, dragged);
    },
    (hit, at) => onOver(entry.id, hit, at),
  );
  // A carta que você não pode ver mostra o VERSO e se anuncia como escondida:
  // a limitação é de verdade, e a tela não finge saber o que não recebeu.
  const label = entry.card ? cardLabel(entry.card) : "carta escondida";
  const action = armed ? `Confirmar ${label}` : `Jogar ${label}`;

  return (
    <button
      type="button"
      ref={element}
      className={[
        "fdp-card",
        dimmed && "is-idle",
        isNew && "is-new",
        airborne && "is-airborne",
        armed && "is-armed",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={playable ? action : label}
      {...drag}
      onClick={(event) => {
        // detail === 0 means keyboard: the pointer handlers never ran.
        if (event.detail === 0) resolve(true, poseOfCard(event.currentTarget), true);
      }}
    >
      <img src={entry.card ? artUrl(entry.card) : backUrl(back)} alt="" />
    </button>
  );
}

/**
 * A carta de pé, e as duas horas em que ela precisa deitar sozinha.
 *
 * Uma é a jogada dar certo: a carta sai da mão e some do `playableIds`. A
 * outra é a vez passar para outro, que esvazia o conjunto inteiro — a carta
 * continua na mão, mas armada ela seria uma promessa que a mesa não cumpre
 * mais. As duas se leem no mesmo lugar, e é por isso que são uma checagem só.
 *
 * Ela é uma DERIVAÇÃO, e não um efeito que zera o estado depois: a carta que
 * deixou de ser jogável já não está armada neste render, e não no seguinte. O
 * id velho fica guardado sem fazer nada, até o próximo toque escrever por
 * cima — apagá-lo custaria o render a mais que esta conta existe para evitar.
 */
function useArmedCard(playableIds: Set<string>) {
  const [armed, setArmed] = useState<string | null>(null);
  return [armed && playableIds.has(armed) ? armed : null, setArmed] as const;
}

const NO_CARDS: ReadonlySet<string> = new Set();

/**
 * Cards that were not in the hand on the previous render, so they can flip in.
 *
 * O leque redesenha a cada patch da mesa, e quase nenhum deles tem a ver com
 * as suas cartas: um adversário comprou, a vez andou, alguém falou. Sem carta
 * nova nada é construído e nada é lembrado de novo — o caso comum, que é o
 * caso de quase sempre, não custa nada.
 */
function useFreshCards(cards: HandEntry[]) {
  const known = useRef<Set<string>>(new Set());
  const first = known.current.size === 0;

  let fresh: Set<string> | null = null;
  for (const entry of cards) {
    if (!known.current.has(entry.id)) (fresh ??= new Set()).add(entry.id);
  }

  useEffect(() => {
    // Nada novo e o mesmo tamanho é a mesma mão, carta por carta: não há o que
    // reescrever.
    if (!fresh && known.current.size === cards.length) return;
    known.current = new Set(cards.map((entry) => entry.id));
  });

  return first || !fresh ? NO_CARDS : fresh;
}

/**
 * A silhueta: a carta que vai cair ali, apagada e contornada.
 *
 * A arte é a da própria carta, e não um retângulo qualquer — quem arrasta está
 * olhando para uma dama de espadas, e é a dama de espadas que precisa aparecer
 * do outro lado do leque. Ela não é botão, não recebe foco e não se anuncia:
 * é um lugar reservado, e não uma carta a mais na mão.
 */
function Ghost({ entry }: { entry: HandEntry }) {
  const back = useUi((ui) => ui.back);
  return (
    <span aria-hidden className="fdp-card fdp-ghost">
      <img src={entry.card ? artUrl(entry.card) : backUrl(back)} alt="" />
    </span>
  );
}
