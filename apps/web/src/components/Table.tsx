import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { toCard } from "@fdp/shared";
import type { Card, MatchStage, PeekedHand, RoundResult, TableState } from "@fdp/shared";
import type { RoomActions, RoomConnection } from "../game/useRoomConnection";
import { flyPlay, markLeaving, type Pose } from "../game/flights";
import { useEmotes } from "../game/useEmotes";
import { artUrl, scatter, strongestIndex } from "../lib/cards";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useSound } from "../lib/sound";
import { useUi } from "../store/ui";
import { CentrePile } from "./CentrePile";
import { ConfigMenu } from "./ConfigMenu";
import { DrawPile } from "./DrawPile";
import { EmoteBubble } from "./EmoteBubble";
import { EmotePicker } from "./EmotePicker";
import { Hand, type HandEntry } from "./Hand";
import { PlayerSeat } from "./PlayerSeat";
import { RulesMenu } from "./RulesMenu";
import { SystemLog } from "./SystemLog";

type Props = {
  state: TableState;
  sessionId: string;
  hand: Card[];
  /** As cartas que estão na sua mão e que você não pode ver (rodada às cegas). */
  hiddenIds?: string[];
  /** As mãos dos adversários, abertas na rodada às cegas. */
  peek?: PeekedHand[];
  /** As promessas que o servidor deixa você declarar agora. */
  promises?: number[];
  playableIds: Set<string>;
  actions: RoomActions;
  /**
   * A conversa da mesa. Opcional porque a mesa de mentira do /mock não tem
   * sala atrás dela.
   */
  onEmote?: RoomConnection["onEmote"];
  /** Deixa a mesa e volta para a tela inicial. */
  onExit: () => void;
};

export function Table({
  state,
  sessionId,
  hand,
  hiddenIds = [],
  peek = [],
  promises = [],
  playableIds,
  actions,
  onEmote,
  onExit,
}: Props) {
  const centreRef = useRef<HTMLDivElement>(null);
  const [dropArmed, setDropArmed] = useState(false);
  const soundEnabled = useUi((ui) => ui.soundEnabled);
  const toggleSound = useUi((ui) => ui.toggleSound);

  /*
   * A mesa redonda é uma escolha de quem joga, mas só existe onde cabe: abaixo
   * de 1024px os assentos em roda viram assentos um em cima do outro. O corte é
   * aqui, e não numa media query no CSS, porque as posições dos assentos são
   * conta de JavaScript — o CSS só recebe o resultado. Uma verdade só para os
   * dois lados.
   */
  const wide = useMediaQuery("(min-width: 1024px)");
  const ring = useUi((ui) => ui.seatLayout) === "ring" && wide;

  useTableSounds(state, sessionId);
  const sound = useSound();
  const bubbles = useEmotes(onEmote);

  const yourTurn = state.currentPlayerId === sessionId && state.phase === "playing";
  const bidding = state.stage === "making_promises";
  const yourBid = bidding && yourTurn;
  const you = state.players.find((player) => player.id === sessionId);
  /*
   * A vaza que se anulou: está completa — uma carta de cada um que ainda joga —
   * e não tem dono. Sem dizer isto, a mesa mostra cinco cartas e nenhum assento
   * marcado, e quem olha acha que a tela travou.
   */
  const playing = state.players.filter((player) => !player.eliminated).length;
  const voidTrick =
    state.stage === "playing_trick" &&
    state.centreCount >= playing &&
    playing > 0 &&
    !state.lastTrickWinnerId;
  const peekBySeat = useMemo(
    () => Object.fromEntries(peek.map((seat) => [seat.playerId, seat.cards])),
    [peek],
  );
  /*
   * O leque, com as escondidas no fim. A carta escondida entra como uma posição
   * SEM carta: ela existe, é jogável, e a tela não sabe qual é — que é
   * exatamente o que o servidor mandou.
   */
  const entries = useMemo<HandEntry[]>(
    () => [
      ...hand.map((card) => ({ id: card.id, card })),
      ...hiddenIds.map((id) => ({ id, card: null })),
    ],
    [hand, hiddenIds],
  );
  const seats = seatOrder(state, sessionId);
  const [seatRow, lineStarts, seatBox] = useSeatRow(seats.length, ring);
  // Só muda quando a mesa muda de tamanho ou de gente.
  const round = useMemo(() => ringLayout(seats.length, TURN_DIRECTION, seatBox), [seatBox, seats.length]);
  const current = state.players.find((player) => player.id === state.currentPlayerId);
  // O aviso das cegas está no ar. Uma conta só para os dois lugares que
  // dependem dele: a tira e o que ela cobriria — ver o cabeçalho.
  const blindBanner = state.blind && state.stage !== "round_result";
  // Quem venceu: um de costume, vários quando a última rodada zerou a mesa
  // inteira no mesmo saldo, nenhum quando não sobrou ninguém.
  const champions = state.players.filter((player) => state.winnerIds.includes(player.id));

  /*
   * A sua carta parte no clique, sem esperar o servidor confirmar. Ela é a
   * única que o cliente conhece antes da resposta — e é justamente a que não
   * pode esperar: os 100ms da ida e volta são o tempo de ela voltar para o
   * leque e sair de novo. Se a jogada for recusada, a carta reaparece na mão.
   *
   * O destino é a pose EXATA que ela terá na pilha, com o mesmo espalhamento
   * que o CentrePile vai calcular. Voar até o centro e espalhar depois custa
   * um pulo de uns quinze pixels no quadro seguinte ao pouso.
   */
  const launch = (card: Card, from: Pose) => {
    const total = state.centreCount + 1;
    // Ela só pousa neat no topo se for a maior da mesa; sob uma maior, pousa
    // espalhada como qualquer outra. Errar isso é o pulo de uns quinze pixels
    // que a pose exata existe para evitar.
    const trick = [...state.centre.map(toCard), card];
    const isTop = strongestIndex(trick, state.porcao) === trick.length - 1;
    const { rot, dx, dy } = scatter(total - 1, total, isTop);
    flyPlay({ kind: "me", from }, { id: card.id, art: artUrl(card) }, { rot, dx, dy });
    markLeaving(card.id);
  };

  const play = (cardId: string, from: Pose) => {
    /*
     * O barulho da SUA carta sai no clique, e não na volta do servidor.
     *
     * Ele nascia do estado: uma pilha do centro maior que a de antes era uma
     * carta baixada, e isso vale para a carta de qualquer um — menos para a
     * sua, que parte antes de o servidor confirmar. A carta já estava no ar e o
     * som ainda esperando o eco de ida e volta, quando saía. Aqui ele acompanha
     * a carta, e o `useTableSounds` ignora a jogada que é sua.
     */
    sound("play");
    const card = hand.find((item) => item.id === cardId);
    // A carta às cegas não voa: não há arte para mandar pelo ar, e inventar uma
    // seria a tela contando uma carta que ela não recebeu. Ela aparece no
    // centro quando o servidor disser qual era.
    if (!card) {
      if (hiddenIds.includes(cardId)) actions.play(cardId);
      return;
    }
    actions.play(cardId);
    launch(card, from);
  };

  return (
    <div className="fdp-table flex min-h-dvh flex-col gap-2 p-2 sm:gap-3 sm:p-4">
      {/*
        `relative` pelo painel do ConfigMenu, que pende desta barra e não do
        próprio botão — ver .fdp-menu-panel em index.css.

        No celular ela é uma TIRA de uma linha, e não um cabeçalho com uma
        fileira de botões embaixo: as duas fileiras custavam quase um terço da
        altura da tela para dizer de quem era a vez. O que sai são as PALAVRAS
        que o desenho ao lado já diz, e elas continuam lá para quem lê a tela
        com os ouvidos. O que não sai é nenhuma informação.
      */}
      <header className="fdp-header px-slab relative flex items-center justify-between gap-3 px-3 py-1 sm:flex-wrap sm:px-4 sm:py-2">
        <span className="flex min-w-0 items-baseline gap-2">
          {/* Encolhe até sumir antes de cortar o nome de quem joga: o nome da
              mesa é o que se sabe de cor, e a vez é o que se está esperando. */}
          <span className="px-label min-w-0 truncate">{state.roomName}</span>
          <span className="shrink-0 text-sm" style={{ color: "var(--paper-hi)" }}>
            {/* O mesmo ▶ que marca o assento da vez lá embaixo. Na tira ele faz
                o trabalho do "vez de", que não caberia. */}
            <span aria-hidden className="sm:hidden" style={{ color: "var(--mark)" }}>
              ▶{" "}
            </span>
            <span className="sr-only sm:not-sr-only">vez de </span>
            <b style={{ color: "var(--mark)" }}>{current?.name ?? "—"}</b>
          </span>
        </span>

        {/*
          O que a mesa está fazendo, em três números e uma palavra: a rodada, o
          tamanho da mão, quem reparte e a etapa. Sem isto o FDP fica ilegível —
          uma mesa com duas cartas na mão e uma com nove são jogos diferentes, e
          "prometendo" e "jogando" pedem coisas diferentes de quem olha.
        */}
        {/*
          Na mesa redonda e na rodada às cegas ele encosta nos botões: o aviso
          das cegas é uma tira presa ao alto do MEIO da tela, e o meio da tira
          de cima é justamente onde estes números moram. Empurrá-los para a
          direita é o que os deixa legíveis com o aviso no ar — nas outras
          combinações eles ficam onde sempre estiveram.
        */}
        <span
          className={`px-label hidden shrink-0 items-baseline gap-2 sm:flex ${
            ring && blindBanner ? "ml-auto" : ""
          }`}
        >
          <span>
            rodada <b style={{ color: "var(--paper-hi)" }}>{state.round}</b>
          </span>
          <span>·</span>
          <span>
            <b style={{ color: "var(--paper-hi)" }}>{state.cardsPerPlayer}</b>{" "}
            carta{state.cardsPerPlayer === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span>
            <b style={{ color: "var(--paper-hi)" }}>
              {state.players.find((player) => player.id === state.dealerId)?.name ?? "—"}
            </b>{" "}
            distribuiu
          </span>
          <span>·</span>
          <span style={{ color: "var(--mark)" }}>{STAGE_LABEL[state.stage]}</span>
        </span>

        <span className="flex shrink-0 items-center gap-3 sm:gap-4">
          {/* As regras da casa saíram da tira e viraram painel: os dois
              distintivos diziam QUAIS estavam de pé, e nunca o que elas fazem
              — que é o que se pergunta no meio de uma mão. A conta no rótulo
              guarda o de relance, e o clique guarda o resto. */}
          <RulesMenu
            rules={{ cangar: state.cangar, porcao: state.porcao }}
            maxCards={state.maxCards}
          />
          <ConfigMenu wide={wide} />
          <button
            type="button"
            onClick={toggleSound}
            className="px-link"
            aria-label={soundEnabled ? "Desligar o som" : "Ligar o som"}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
        </span>
      </header>

      {/*
        A fileira é sempre a ordem do array de jogadores começando depois de
        você — o que muda com o inverter não é a ordem dos assentos, é para que
        lado a vez corre por eles. Daí a setinha entre um assento e o outro: ela
        aponta para quem joga depois. Quem quer a palavra lê "horário" no
        cabeçalho, quem só quer saber de quem é a vez seguinte segue a seta.

        No celular ela não aparece: ali os assentos já quebram em várias
        fileiras, e uma seta a cada par cobra a largura de que o nome precisa
        para não ser cortado. O cabeçalho continua dizendo o sentido por
        extenso.

        Na mesa redonda ela continua entre os dois assentos, agora no ponto do
        arco entre eles — e apontando para onde o arco segue: ↑ ↗ → ↘ ↓ e as
        outras três. São oito setas prontas, e não uma girada por `rotate`:
        girar um glifo de 16px o borra, e nesta interface nada é borrado.
      */}
      {/*
        Assentos e pilhas na mesma caixa, porque na mesa redonda um é o lugar do
        outro: a roda se arma em volta das pilhas, e para haver "em volta" os
        dois precisam dividir o mesmo retângulo. Na fileira de sempre eles
        continuam sendo duas faixas empilhadas com a folga de sempre entre elas.
      */}
      <section className={`fdp-arena flex flex-1 flex-col gap-3 ${ring ? "fdp-arena-ring" : ""}`}>
        {/* A folga entre fileiras encolhe no celular; a horizontal não: são os
            16px de que o ▶ da vez precisa à esquerda do assento. */}
        <div
          ref={seatRow}
          className="fdp-seats flex flex-wrap items-start justify-center gap-x-4 gap-y-2 sm:gap-y-4"
        >
          {seats.map((player, index) => (
            <Fragment key={player.id}>
              {index > 0 && (
                <span
                  className={`fdp-flow hidden sm:block ${
                    !ring && lineStarts.includes(index) ? "fdp-flow-wrapped" : ""
                  }`}
                  style={ring ? at(round.flows[index - 1]) : undefined}
                  aria-hidden="true"
                >
                  {ring ? round.flows[index - 1].glyph : "→"}
                </span>
              )}
              {/* A cadeira, que na fileira não existe (`display: contents`) e na
                  roda é o que carrega o assento até o seu lugar na elipse. */}
              <span className="fdp-chair" style={ring ? at(round.seats[index]) : undefined}>
                <PlayerSeat
                  player={player}
                  active={player.id === state.currentPlayerId}
                  isHost={player.id === state.hostId}
                  isDealer={player.id === state.dealerId}
                  wonTrick={player.id === state.lastTrickWinnerId && state.centreCount > 0}
                  bidding={bidding}
                  peek={peekBySeat[player.id]}
                  bubble={bubbles[player.id]}
                />
              </span>
            </Fragment>
          ))}
        </div>

        {/* A mesa: o que está em jogo, e de todo mundo. */}
        <div className="fdp-piles relative flex flex-1 items-center justify-center gap-12 sm:gap-20">
          {/* No FDP não se compra: o monte é o resto do baralho, que nesta
              rodada não coube na mão de ninguém. Fica na mesa como medida do
              que sobrou, e não como um botão. */}
          <DrawPile remaining={state.deckCount} />
          <CentrePile
            ref={centreRef}
            cards={state.centre}
            total={state.centreCount}
            porcao={state.porcao}
            armed={dropArmed}
          />

          {voidTrick && (
            <p className="fdp-void px-label" role="status">
              mão anulada · não é de ninguém
            </p>
          )}
        </div>
      </section>

      {/*
        O seu lado: as ações são sobre a sua mão, não sobre as pilhas, então
        moram junto do leque. As duas seções são `flex-1`, então a folga de uma
        tela alta se divide entre a mesa e você em vez de empoçar num lugar só.
        O log flutua por cima do canto: uma coluna fixa empurraria o leque e a
        página ganharia rolagem.
      */}
      {/*
        O gap-8 abaixo das ações são os mesmos 32px que a carta sobe no hover,
        então uma carta levantada encosta nos botões em vez de cobri-los.

        Sem `flex-1` aqui: toda a folga vai para a mesa, que centra as pilhas, e
        o seu lado fica a uma distância fixa da borda de baixo. Centrar este
        bloco faria a folga sob a mão crescer com a altura da janela — 322px de
        feltro vazio num monitor de 1920.
      */}
      <div className="relative mt-3 flex flex-col items-center gap-8 pb-8">
        <div className="absolute bottom-0 left-0 hidden md:block">
          <SystemLog messages={state.log} />
        </div>

        <div className="relative flex min-h-9 flex-wrap items-center justify-center gap-3">
          {/* O seu balão nasce aqui porque você não tem assento: a fileira de
              ações é o seu lugar na mesa, e o balão pende dela para cima como o
              dos outros pende do assento deles. Absoluto pelo mesmo motivo —
              nada se move quando ele vai e vem. */}
          {bubbles[sessionId] && (
            <span className="absolute bottom-full left-1/2 z-20 -translate-x-1/2 pb-1">
              <EmoteBubble
                key={bubbles[sessionId].seq}
                emote={bubbles[sessionId].emote}
              />
            </span>
          )}

          {/*
            O que a mesa está esperando de VOCÊ. São três situações e nada mais:
            declarar a promessa, baixar uma carta, ou esperar. Não há passar e
            não há comprar — quem tem carta joga.
          */}
          {yourBid && (
            <PromisePanel
              cards={state.cardsPerPlayer}
              promised={state.promised}
              options={promises}
              onPromise={actions.promise}
            />
          )}

          {!yourBid && bidding && (
            <p className="px-label">Esperando as promessas<span className="px-caret">▌</span></p>
          )}

          {state.stage === "playing_trick" && (
            <p className="px-label">
              mão <b style={{ color: "var(--paper-hi)" }}>{state.trickNumber}</b> de{" "}
              <b style={{ color: "var(--paper-hi)" }}>{state.cardsPerPlayer}</b>
              {you && you.promise >= 0 && !you.eliminated && (
                <>
                  {" · "}sua promessa{" "}
                  <b style={{ color: "var(--mark)" }}>
                    {you.tricks}/{you.promise}
                  </b>
                </>
              )}
            </p>
          )}

          {/* Falar vale sempre: fora da sua vez e depois de a partida acabar.
              É a única coisa na mesa que nunca depende de estado nenhum. */}
          <EmotePicker onSend={actions.emote} />
        </div>

        <Hand
          cards={entries}
          playableIds={playableIds}
          yourTurn={yourTurn}
          dropTarget={centreRef}
          onPlay={play}
          onDragOver={setDropArmed}
        />
      </div>

      {/*
        A rodada às cegas, dita com todas as letras: sem este aviso o leque com
        um verso vira bug na cabeça de quem olha, e não regra.
      */}
      {blindBanner && (
        <p className="fdp-banner px-label" role="status">
          ⚠ rodada às cegas · você vê a carta dos outros, não a sua
        </p>
      )}

      {/*
        O placar da rodada, por cima da mesa e por alguns segundos: é o único
        momento em que a partida inteira cabe numa tela, e é o que transforma
        "perdi dois pontos" em "faltam quatro para eu sair".
      */}
      {state.stage === "round_result" && state.results.length > 0 && (
        <RoundScore
          results={state.results}
          players={state.players}
          you={sessionId}
          cards={state.cardsPerPlayer}
          round={state.round}
        />
      )}

      {state.phase === "finished" && (
        <div className="fixed inset-0 z-40 grid place-content-center bg-black/70 p-4">
          <div className="px-slab flex flex-col items-center gap-4 p-8 text-center">
            <p className="px-label">Fim de partida</p>
            <p className="px-code">
              {champions.length > 0
                ? champions.map((player) => player.name).join(" e ")
                : "Ninguém"}
            </p>
            <p className="px-label">
              {champions.length > 1
                ? "empataram no fundo do poço"
                : champions.length === 1
                  ? "foi o último de pé"
                  : "sobrou de pé"}
            </p>

            {/* Como cada um terminou. Perder não é vergonha nenhuma neste jogo:
                é o placar de quantas rodadas cada um aguentou.

                Quem passou do zero aparece com o saldo negativo, e não com o
                zero da regra: quando a última rodada derruba a mesa inteira,
                "0 e 0" não diz nada, e "-1 e -3" diz tudo. */}
            <ul className="flex w-full flex-col gap-1 text-sm">
              {[...state.players]
                .sort((a, b) => b.overshoot - a.overshoot)
                .map((player) => {
                  const crowned = state.winnerIds.includes(player.id);
                  const short = player.overshoot < 0;
                  return (
                    <li key={player.id} className="flex items-baseline justify-between gap-4">
                      <span style={{ color: crowned ? "var(--mark)" : "var(--paper-sh)" }}>
                        {crowned && "👑 "}
                        {player.name}
                        {player.id === sessionId && " (você)"}
                      </span>
                      <span style={{ color: short ? "var(--ink-red)" : "var(--paper-hi)" }}>
                        {short ? player.overshoot : player.points} pt
                      </span>
                    </li>
                  );
                })}
            </ul>

            {/* Duas saídas para o fim da partida: outra mão, ou a porta. Quem
                não é host só tem a porta — e antes não tinha nenhuma. */}
            <div className="flex flex-col items-stretch gap-2">
              {state.hostId === sessionId ? (
                <button
                  type="button"
                  onClick={actions.restart}
                  className="px-btn px-btn-primary"
                >
                  Jogar de novo
                </button>
              ) : (
                <p className="px-label">Aguardando o host começar outra</p>
              )}
              <button type="button" onClick={onExit} className="px-btn">
                Voltar ao início
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Duas medidas da caixa dos assentos, uma para cada arrumação — e só a da vez
 * é calculada.
 *
 * Na fileira: quais assentos abrem uma linha nova, para a seta que vem antes
 * deles poder sumir. Ela apontaria para um vizinho que está na linha de baixo,
 * e no fim da fileira lê como enfeite pendurado na borda.
 *
 * Some por `visibility`, e não deixando de ser desenhada: tirá-la do fluxo
 * devolveria a largura dela à fileira, o que pode caber mais um assento, o que
 * muda a quebra, o que remede — e a seta piscaria para sempre. Invisível, ela
 * guarda o lugar e a medida se estabiliza na primeira passada.
 *
 * Na roda não há linha que quebre: o que se mede é o retângulo em que a elipse
 * está inscrita, porque é a proporção dele que decide para que lado cada seta
 * do arco aponta. Uma elipse larga é quase horizontal no topo; uma quase
 * redonda já sobe de verdade ali.
 *
 * O custo é um ResizeObserver e uma varredura de `offsetTop` a cada vez que a
 * caixa muda de tamanho: nada roda por quadro nem por jogada.
 */
function useSeatRow(seatCount: number, ring: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [starts, setStarts] = useState<number[]>([]);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;

    const measure = () => {
      if (ring) {
        const { width, height } = row.getBoundingClientRect();
        // Mesma conversa do `starts`: só troca o estado quando a medida mudou.
        return setBox((current) =>
          current.w === width && current.h === height ? current : { w: width, h: height },
        );
      }

      const seats = row.querySelectorAll<HTMLElement>(".fdp-seat");
      const next: number[] = [];
      seats.forEach((seat, index) => {
        const previous = seats[index - 1];
        if (previous && seat.offsetTop > previous.offsetTop) next.push(index);
      });
      // Só troca o estado quando a quebra de fato mudou — senão cada resize
      // seria um render novo com a mesma resposta.
      setStarts((current) =>
        current.length === next.length && current.every((value, i) => value === next[i])
          ? current
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [ring, seatCount]);

  return [ref, starts, box] as const;
}

/**
 * Para que lado a vez corre. Constante enquanto não houver regra que a inverta
 * — e quando houver, ela vira um campo do estado e entra aqui pela mesa.
 */
const TURN_DIRECTION = 1;

/* ---- a mesa redonda ------------------------------------------------------
 * Você está embaixo, do lado de cá da tela, com o leque na mão — esse é o seu
 * lugar na roda, e é por isso que a roda é um ARCO e não um círculo fechado: o
 * pedaço que falta é você. Os outros se sentam em volta das pilhas, na ordem
 * em que jogam, saindo da sua esquerda.
 *
 * Sair pela esquerda não é gosto: com você embaixo olhando para a mesa, o
 * sentido horário — o que o cabeçalho chama de "↻ horário" — passa por baixo à
 * esquerda, sobe, cruza o topo e desce à direita. Quem inverte a mesa não
 * remexe os assentos, só vira as setas; ninguém troca de cadeira no meio da
 * partida por causa de um carta de inverter.
 * ------------------------------------------------------------------------- */

/** O arco todo, e o quanto pode caber entre um assento e o vizinho. */
const RING_SPAN = 220;
const RING_GAP = 70;

/*
 * Os dois raios da elipse, em porcentagem da caixa dos assentos.
 *
 * O horizontal é metade da largura, sem mistério. O vertical é maior que
 * metade da altura, e o centro desce junto: como o arco para nos 110° e não
 * fecha embaixo, uma elipse inscrita na caixa deixaria o terço de baixo dela
 * vazio — uma faixa de feltro entre o assento mais baixo e a sua mão. Esticada
 * assim, o topo do arco encosta no topo da caixa e as pontas encostam no
 * fundo; o pedaço que sobra para fora, embaixo, é o seu lugar na roda.
 */
const RING_RX = 50;
const RING_RY = 100 / (1 - Math.cos((RING_SPAN / 2) * (Math.PI / 180)));

type Box = { w: number; h: number };
type Slot = { x: number; y: number };

/**
 * Onde cada assento se senta e onde cada seta fica, em porcentagem da caixa
 * dos assentos. Porcentagem porque a elipse é a caixa: quem decide o tamanho
 * da roda é o CSS, que sabe quanto sobrou de tela.
 */
function ringLayout(count: number, direction: number, box: Box) {
  const angles = evenArc(count, Math.min(RING_SPAN, RING_GAP * (count - 1)), box);

  return {
    seats: angles.map(onEllipse),
    // A seta de índice i fica entre o assento i e o i+1.
    flows: angles.slice(1).map((angle, i) => ({
      ...onEllipse((angles[i] + angle) / 2),
      glyph: tangent((angles[i] + angle) / 2, direction, box),
    })),
  };
}

/**
 * Os ângulos que repartem o arco em pedaços do mesmo COMPRIMENTO — e não do
 * mesmo ângulo.
 *
 * A roda é uma elipse larga e baixa, e nela um grau vale coisas muito
 * diferentes conforme onde se está: no topo, meia mesa; na lateral, um palmo.
 * Repartindo por ângulo, os assentos das pontas se amontoam justamente onde
 * cada um deles é mais alto — o "PEGAR" e o "TROCAR" nascem ali — e dois
 * vizinhos acabam se encostando numa tela de notebook.
 *
 * Sem fórmula fechada para o arco de elipse: mede-se andando, em 720 passos,
 * e depois pescam-se as marcas. São umas poucas centenas de contas por
 * mudança de tamanho da caixa (o `useMemo` de quem chama segura o resto).
 */
function evenArc(count: number, span: number, box: Box) {
  if (count < 2) return [0];

  const rx = (box.w * RING_RX) / 100;
  const ry = (box.h * RING_RY) / 100;
  const at = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return { x: rx * Math.sin(radians), y: -ry * Math.cos(radians) };
  };

  const STEPS = 720;
  const step = span / STEPS;
  const walked = [0];
  for (let i = 1; i <= STEPS; i++) {
    const from = at(-span / 2 + step * (i - 1));
    const to = at(-span / 2 + step * i);
    walked.push(walked[i - 1] + Math.hypot(to.x - from.x, to.y - from.y));
  }

  const total = walked[STEPS];
  let cursor = 0;
  return Array.from({ length: count }, (_, i) => {
    const target = (total * i) / (count - 1);
    while (cursor < STEPS && walked[cursor + 1] < target) cursor++;
    // Entre uma marca e a seguinte o arco é reto o bastante para uma regra de três.
    const stretch = walked[cursor + 1] - walked[cursor];
    const into = stretch === 0 ? 0 : (target - walked[cursor]) / stretch;
    return -span / 2 + step * (cursor + into);
  });
}

/** Ângulo em graus a partir do topo, crescendo no sentido horário. */
function onEllipse(degrees: number): Slot {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: RING_RX + RING_RX * Math.sin(radians),
    y: RING_RY - RING_RY * Math.cos(radians),
  };
}

/** As oito setas, começando na que aponta para a direita e girando com o relógio. */
const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];

/**
 * Para onde o arco segue neste ponto, arredondado para uma das oito setas. A
 * derivada da elipse em relação ao ângulo é (largura·cos, altura·sen) — e é aí
 * que a proporção da caixa entra: num arco largo e baixo o topo é quase
 * horizontal, e a seta certa lá é "→" e não "↗".
 */
function tangent(degrees: number, direction: number, box: Box) {
  const radians = (degrees * Math.PI) / 180;
  const dx = box.w * RING_RX * Math.cos(radians) * direction;
  const dy = box.h * RING_RY * Math.sin(radians) * direction;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ARROWS[(octant + 8) % 8];
}

/** O lugar na elipse virando as duas custom properties que o CSS lê. */
const at = ({ x, y }: Slot) => ({ "--x": `${x}%`, "--y": `${y}%` }) as CSSProperties;

/** Os outros na ordem da vez, começando depois de você; você não vira assento. */
function seatOrder(state: TableState, sessionId: string) {
  const index = state.players.findIndex((player) => player.id === sessionId);
  if (index === -1) return state.players;
  return [...state.players.slice(index + 1), ...state.players.slice(0, index)];
}

function useTableSounds(state: TableState, sessionId: string) {
  const play = useSound();
  const previous = useRef({ latest: "", turn: "", phase: state.phase });

  useEffect(() => {
    const before = previous.current;
    // A ÚLTIMA baixada, que não é a de cima: o topo da pilha é a maior carta
    // da mesa. Quem toca é a jogada, e jogada é carta nova no fim do centro.
    const latest = state.centre.at(-1);

    /*
     * Carta baixada é carta NOVA no fim do centro, e não uma pilha mais alta
     * que a de antes.
     *
     * Pela altura, o primeiro a baixar numa mão nova podia sair mudo: o React
     * junta dois patches que chegam no mesmo quadro, e "o centro esvaziou" e "o
     * centro tem uma carta" juntos viram 3 → 1, que não é crescer. Justamente o
     * caso mais comum de todos — quem levou a mão é quem sai na seguinte, e ele
     * clica quando as cartas acabaram de sumir da mesa.
     *
     * E a SUA carta não toca aqui: ela já tocou no clique, lá no `play` da
     * mesa, sem esperar o eco do servidor. Tocar de novo na confirmação seria a
     * mesma carta soando duas vezes.
     */
    if (latest && latest.id !== before.latest && latest.owner !== sessionId) play("play");
    /*
     * O reparto não está aqui. A mão só cresce nele — não se compra no FDP —, e
     * ele tem batida própria em `flyDeal`, uma por carta: o efeito único que
     * havia soava no mesmo instante, por cima dela.
     */
    if (state.currentPlayerId === sessionId && before.turn !== sessionId) play("turn");
    if (state.phase === "finished" && before.phase !== "finished") play("victory");
    previous.current = {
      latest: latest?.id ?? "",
      turn: state.currentPlayerId,
      phase: state.phase,
    };
  }, [play, sessionId, state.centre, state.currentPlayerId, state.phase]);
}


/** O que a mesa está fazendo agora, em uma palavra, para o cabeçalho. */
const STAGE_LABEL: Record<MatchStage, string> = {
  waiting_for_players: "esperando",
  round_start: "nova rodada",
  dealing: "repartindo",
  making_promises: "promessas",
  playing_trick: "jogando",
  round_result: "placar",
  player_elimination: "eliminação",
  game_over: "fim",
};

/**
 * A promessa: quantas vazas você diz que vai fazer.
 *
 * Um contador em vez de uma botoeira: com dez cartas na mão a fileira de
 * botões enchia a barra inteira, e o número que você quer é quase sempre
 * vizinho do anterior. Deitado no desktop, em pé no telefone.
 *
 * Quem diz o que é possível é o SERVIDOR — `options` é a lista que ele mandou,
 * e a tela não recalcula nada. O contador anda por cima do número proibido em
 * vez de pulá-lo: pular faria o `+` parecer defeito. Ele avisa, e não deixa
 * confirmar.
 */
function PromisePanel({
  cards,
  promised,
  options,
  onPromise,
}: {
  cards: number;
  promised: number;
  options: number[];
  onPromise: (promise: number) => void;
}) {
  // Começa no primeiro número que dá para confirmar — zero, quase sempre.
  const [value, setValue] = useState(() => (options.includes(0) ? 0 : (options[0] ?? 0)));
  /*
   * O aviso é um balão que fica de pé enquanto o número recusado estiver no
   * mostrador: ele não é um recado que passa, é o motivo de o Confirmar não
   * funcionar, e sumir sozinho deixaria o botão morto sem explicação. Quem o
   * apaga é trocar para um número que dá.
   *
   * O `seq` é o que faz o aviso saltar DE NOVO quando você insiste no
   * Confirmar: sem uma chave nova o React reaproveita o nó, a animação não
   * recomeça, e quem apertou não vê resposta nenhuma.
   */
  const [warning, setWarning] = useState<{ text: string; seq: number } | null>(null);
  const seq = useRef(0);

  const allowed = options.includes(value);

  const warn = (n: number) => {
    seq.current += 1;
    setWarning({
      text: `você é o último a declarar: a soma das promessas não pode dar ${cards}. Já foram ${promised}, então ${n} está fora.`,
      seq: seq.current,
    });
  };

  const step = (delta: number) => {
    const next = Math.min(cards, Math.max(0, value + delta));
    if (next === value) return;
    setValue(next);
    if (options.includes(next)) setWarning(null);
    else warn(next);
  };

  const confirm = () => {
    if (allowed) onPromise(value);
    else warn(value);
  };

  return (
    <div className="relative">
      {/* Fora do quadro e por cima dele: o aviso não pode empurrar os botões
          para baixo no meio de uma escolha. */}
      {warning && (
        <div
          key={warning.seq}
          role="status"
          className="fdp-warn px-slab pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[min(22rem,80vw)] -translate-x-1/2 px-3 py-2"
        >
          <p className="px-label text-center" style={{ color: "var(--mark)" }}>
            ⚠ {warning.text}
          </p>
        </div>
      )}

      <div className="px-slab flex flex-col items-center gap-3 px-4 py-3 md:flex-row md:gap-4">
        <p className="px-label text-center md:max-w-32 md:text-left">
          Sua promessa · quantas mãos você faz?
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="px-btn"
            onClick={() => step(-1)}
            disabled={value === 0}
            aria-label="uma mão a menos"
          >
            −
          </button>
          <span
            className="fdp-bid"
            aria-live="polite"
            style={{ color: allowed ? "var(--mark)" : "var(--ink-red)" }}
          >
            {value}
          </span>
          <button
            type="button"
            className="px-btn"
            onClick={() => step(1)}
            disabled={value === cards}
            aria-label="uma mão a mais"
          >
            +
          </button>
        </div>

        <button
          type="button"
          className={`px-btn w-full md:w-auto ${allowed ? "px-btn-primary" : ""}`}
          onClick={confirm}
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

/**
 * O placar da rodada. Uma linha por jogador: o que prometeu, o que fez, o que
 * isso custou e o que sobrou. A coluna que importa é a do meio — é a distância
 * entre as duas primeiras que vira pontos perdidos.
 */
function RoundScore({
  results,
  players,
  you,
  cards,
  round,
}: {
  results: RoundResult[];
  players: TableState["players"];
  you: string;
  cards: number;
  round: number;
}) {
  const name = (id: string) => players.find((player) => player.id === id)?.name ?? "—";

  return (
    <div className="fixed inset-0 z-40 grid place-content-center bg-black/70 p-4">
      <div className="px-slab flex flex-col gap-3 p-6">
        <p className="px-label text-center">
          Rodada {round} · {cards} carta{cards === 1 ? "" : "s"}
        </p>
        <table className="fdp-score-table text-sm">
          <thead>
            <tr className="px-label">
              <th className="text-left">jogador</th>
              <th>prometeu</th>
              <th>fez</th>
              <th>perdeu</th>
              <th>restam</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.playerId} className={result.eliminated ? "is-out" : ""}>
                <td
                  className="text-left"
                  style={{
                    color: result.playerId === you ? "var(--mark)" : "var(--paper-hi)",
                  }}
                >
                  {name(result.playerId)}
                  {result.playerId === you && " (você)"}
                </td>
                <td>{result.promise}</td>
                <td>{result.tricks}</td>
                <td style={{ color: result.lost === 0 ? "var(--live)" : "var(--ink-red)" }}>
                  {result.lost === 0 ? "—" : `-${result.lost}`}
                </td>
                {/* Quem passou do zero aparece com o saldo negativo: é ele que
                    diz quem chegou mais perto quando a rodada derruba vários
                    de uma vez, e "0 e 0" não diria nada. */}
                <td>
                  <b
                    style={{
                      color: result.overshoot < 0 ? "var(--ink-red)" : "var(--paper-hi)",
                    }}
                  >
                    {result.overshoot < 0 ? result.overshoot : result.points}
                  </b>
                  {result.eliminated && <span className="px-label"> fora</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
