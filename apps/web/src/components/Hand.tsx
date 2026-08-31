import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cardLabel, type Card } from "@fdp/shared";
import { anchorRef, poseOfCard, useFlightStore, type Pose } from "../game/flights";
import { artUrl, backUrl } from "../lib/cards";
import { useUi } from "../store/ui";
import { useDragCard } from "../lib/useDragCard";
import { useMediaQuery } from "../lib/useMediaQuery";

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
};

export function Hand({
  cards: dealt,
  playableIds,
  yourTurn,
  dropTarget,
  onPlay,
  onDragOver,
}: Props) {
  /*
   * A carta que você acabou de jogar já saiu, mesmo que a mão nova ainda esteja
   * a caminho do servidor. Quem a representa daqui em diante é o voo; deixá-la
   * no leque por mais 100ms fazia ela voltar para o lugar e sair de novo.
   */
  const leaving = useFlightStore((state) => state.leaving);
  const cards = leaving ? dealt.filter((entry) => entry.id !== leaving) : dealt;

  /*
   * As cartas compradas entram sempre pelo fim do leque — o servidor faz
   * `hand.push` — então as que ainda estão no ar são as últimas. Elas já ocupam
   * o lugar delas, invisíveis: reservar o espaço antes é o que faz o leque
   * parar de abrir e fechar a cada compra, e é também o que dá ao voo um alvo
   * fixo para mirar.
   */
  const airborne = useFlightStore((state) => state.heldHand);
  const shown = Math.max(0, cards.length - airborne);
  const fresh = useFreshCards(cards.slice(0, shown));

  const middle = (cards.length - 1) / 2;
  const spread = Math.min(SPREAD, MAX_FAN / Math.max(1, cards.length - 1));

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
   * Tocar fora do leque desarma. Sem isto a carta armada é uma armadilha: ela
   * fica de pé enquanto a rodada anda, e o toque seguinte na mão — vindo de
   * outra intenção, minutos depois — a joga.
   */
  useEffect(() => {
    if (!armed) return;
    const away = (event: PointerEvent) => {
      if (!list.current?.contains(event.target as Node)) setArmed(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [armed, setArmed]);

  return (
    <ul
      ref={attach}
      className="fdp-hand"
      aria-label="Sua mão"
      // O CSS aperta o leque conforme a mão cresce, para ele nunca passar da
      // largura da janela. Ver --pull em index.css.
      style={{
        "--cards": cards.length,
        "--gaps-r": 1 / Math.max(1, cards.length - 1),
        "--fit-r": 1 / handSpan(cards.length),
      } as React.CSSProperties}
    >
      {cards.map((entry, index) => {
        const fromMiddle = index - middle;
        const normalized = middle === 0 ? 0 : fromMiddle / middle;
        return (
          <li
            key={entry.id}
            className="fdp-slot"
            style={{
              // the arc is parabolic: flat in the middle, dropping at the ends
              "--angle": `${fromMiddle * spread}deg`,
              "--drop-y": `${normalized * normalized * ARC}px`,
            } as React.CSSProperties}
          >
            <HandCard
              entry={entry}
              playable={playableIds.has(entry.id)}
              dimmed={yourTurn && !playableIds.has(entry.id)}
              isNew={fresh.has(entry.id)}
              airborne={index >= shown}
              armed={armed === entry.id}
              needsConfirm={needsConfirm}
              onArm={setArmed}
              dropTarget={dropTarget}
              onPlay={onPlay}
              onDragOver={onDragOver}
            />
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
  onDragOver: (over: boolean) => void;
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
  onDragOver,
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

  const drag = useDragCard(dropTarget, resolve, onDragOver);
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
