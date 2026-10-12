import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toCard } from "@fdp/shared";
import type { Card, MatchStage, PeekedHand, TableState } from "@fdp/shared";
import type { RoomActions, RoomConnection } from "../game/useRoomConnection";
import { flyPlay, markLeaving, type Pose } from "../game/flights";
import { useEmotes } from "../game/useEmotes";
import { artUrl, scatter, strongestIndex } from "../lib/cards";
import { at, ringLayout, type Box } from "../lib/ringLayout";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useSound } from "../lib/sound";
import { useUi } from "../store/ui";
import { CentrePile } from "./CentrePile";
import { ConfigMenu } from "./ConfigMenu";
import { useHandOrder } from "../game/useHandOrder";
import { DrawPile } from "./DrawPile";
import { EmoteBubble } from "./EmoteBubble";
import { EmotePicker } from "./EmotePicker";
import { GameOver } from "./GameOver";
import { Hand, type HandEntry } from "./Hand";
import { PlayerSeat } from "./PlayerSeat";
import { PromisePanel } from "./PromisePanel";
import { RoundScore } from "./RoundScore";
import { RulesMenu } from "./RulesMenu";
import { SystemLog } from "./SystemLog";
import { YourPoints } from "./YourPoints";

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
  /*
   * A mesa está parada esperando VOCÊ — e não só "é o seu id que está no
   * `currentPlayerId`". São as duas etapas em que existe uma ação sua: cantar
   * a promessa e baixar a carta. Entre uma vaza e outra o id ainda é o seu por
   * um instante, e um aviso piscando ali seria um aviso mentindo.
   */
  const waitingOnYou = yourTurn && (bidding || state.stage === "playing_trick");
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
   * Você está ASSISTINDO: saiu da mesa e a partida continua sem você. O
   * servidor abre a mão de quem ficou — ver `peekedHands` —, e aqui essa mão
   * troca de lugar: em vez de ficar exposta no assento, como na rodada às
   * cegas, ela vai para trás do olho de cada assento. São mãos inteiras, e
   * dez delas abertas ao mesmo tempo não são uma mesa.
   *
   * O olho é só no computador, e por enquanto: o painel é flutuante ao lado do
   * assento, e no celular o assento é uma faixa de duas linhas sem lado nenhum
   * de sobra. Assistindo do celular a mão dos outros não aparece — mas ela
   * também não volta para dentro do assento, que é onde ela viraria dez
   * fileiras de cartas no lugar da mesa.
   */
  const spectating = !!you?.eliminated && state.phase === "playing";
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
  /*
   * A ordem em que VOCÊ deixou as cartas — arrastando uma para o lado ou
   * pedindo o leque ordenado por força. Mora aqui porque os dois lugares que a
   * mexem penduram nesta tela: o leque, logo abaixo, e os ajustes, lá no
   * cabeçalho. Nada disso atravessa a rede.
   */
  const handOrder = useHandOrder(entries);
  const seats = seatOrder(state, sessionId);
  const [seatRow, lineStarts, seatBox] = useSeatRow(seats.length, ring);
  // Só muda quando a mesa muda de tamanho ou de gente.
  const round = useMemo(() => ringLayout(seats.length, TURN_DIRECTION, seatBox), [seatBox, seats.length]);
  const current = state.players.find((player) => player.id === state.currentPlayerId);
  // O aviso das cegas está no ar. Uma conta só para os dois lugares que
  // dependem dele: a tira e o que ela cobriria — ver o cabeçalho.
  const blindBanner = state.blind && state.stage !== "round_result";

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
            startingPoints={state.startingPoints}
          />
          <ConfigMenu wide={wide} onSortHand={handOrder.sort} />
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
                  peek={spectating ? undefined : peekBySeat[player.id]}
                  spy={spectating && wide ? peekBySeat[player.id] : undefined}
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
        {/* Os seus pontos moram em cima do log: os dois são a memória da mesa
            — um conta o que acabou de acontecer, o outro conta no que isso te
            deixou. No celular o log não cabe, e os pontos descem para a fileira
            de ações, que é para onde você já está olhando. */}
        <div className="absolute bottom-0 left-0 hidden flex-col gap-2 md:flex">
          {you && <YourPoints
              points={you.points}
              total={state.startingPoints}
              className="px-slab self-start px-3 py-2"
            />}
          <SystemLog messages={state.log} />
        </div>

        <div className="relative flex min-h-9 flex-wrap items-center justify-center gap-3">
          {you && (
            <span className="flex w-full justify-center md:hidden">
              <YourPoints
                points={you.points}
                total={state.startingPoints}
                className="px-slab px-3 py-1.5"
              />
            </span>
          )}

          {/* Os seus dois balões nascem aqui porque você não tem assento: a
              fileira de ações é o seu lugar na mesa, e eles pendem dela para
              cima como os dos outros pendem do assento deles. Absoluto pelo
              mesmo motivo — nada se move quando eles vão e vêm.

              Empilhados numa coluna só, e não um por cima do outro: o da vez
              fica colado na fileira, que é onde está a ação que ele cobra, e o
              emote sobe. Dois absolutos no mesmo ponto se cobririam. */}
          <span className="pointer-events-none absolute bottom-full left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 pb-1">
            {bubbles[sessionId] && (
              <EmoteBubble
                key={bubbles[sessionId].seq}
                emote={bubbles[sessionId].emote}
              />
            )}
            {waitingOnYou && (
              <span role="status" className="fdp-turn px-label">
                sua vez
              </span>
            )}
          </span>

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

          {/* A sua promessa, com a mesma pastilha que os assentos mostram para
              os outros: você não tem assento, então ela pende do leque. */}
          {bidding && you && !you.eliminated && you.promise >= 0 && (
            <b key={you.promise} className="fdp-call px-pop">
              faço {you.promise}
            </b>
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

          {/* Quem só assiste não tem cadeira na roda: chegou com a partida
              rolando, e o que lhe cabe é olhar. Nem leque, nem voz. */}
          {!you && (
            <p className="px-label">
              👁 assistindo a partida
            </p>
          )}

          {/* Falar vale sempre: fora da sua vez e depois de a partida acabar.
              É a única coisa na mesa que nunca depende de estado nenhum. */}
          {you && <EmotePicker onSend={actions.emote} />}
        </div>

        <Hand
          cards={entries}
          playableIds={playableIds}
          yourTurn={yourTurn}
          dropTarget={centreRef}
          onPlay={play}
          onDragOver={setDropArmed}
          order={handOrder.order}
          onReorder={handOrder.move}
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
        <GameOver
          players={state.players}
          winnerIds={state.winnerIds}
          you={sessionId}
          isHost={state.hostId === sessionId}
          onRestart={actions.restart}
          onExit={onExit}
        />
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
