import { useCallback, useMemo, useRef, useState } from "react";
import {
  JOKERS,
  RANKS,
  STARTER_SPIN,
  SUITS,
  type Card,
  type EmoteEvent,
  type MatchStage,
  type PublicCard,
  type PublicPlayer,
  type TableState,
} from "@fdp/shared";
import { FlightLayer } from "../components/FlightLayer";
import { StarterRoulette } from "../components/StarterRoulette";
import { Table } from "../components/Table";
import { flyDeal } from "../game/flights";
import { useMediaQuery } from "../lib/useMediaQuery";
import type { RoomActions } from "../game/useRoomConnection";

/**
 * Mesa de mentira para acertar o layout sem precisar de servidor nem de outros
 * jogadores: 25 cartas na mão, 10 lugares ocupados, pilha grande. Fica em /mock
 * e não toca em nada do jogo — o `Table` é o mesmo.
 *
 * Quando o FDP tiver regras, é aqui que os estados extremos delas entram: um
 * controle por situação que valha a pena ver sem juntar gente.
 */

const ME = "me";
const NAMES = [
  "Samuel", "Mikhael", "Ana Beatriz", "Bruno", "Caio",
  "Dandara", "Eduardo", "Fernanda", "Gustavo", "Helena",
];

/** Baralho de mentira, mas determinístico: o mesmo mock em todo carregamento. */
function fakeCard(seed: number): Card {
  if (seed % 27 === 13) return { id: `m${seed}`, suit: "joker", rank: JOKERS[seed % 2] };
  return {
    id: `m${seed}`,
    suit: SUITS[seed % SUITS.length],
    rank: RANKS[seed % RANKS.length],
  };
}

const toPublic = (card: Card, owner = ""): PublicCard => ({
  id: card.id,
  suit: card.suit,
  rank: card.rank,
  owner,
});

export function MockScreen() {
  /*
   * Aberta onde ela cabe ao lado da mesa, fechada onde ela cobriria a mesa —
   * mas só até alguém decidir. `null` é "ainda não decidiram", e é o que deixa
   * o padrão seguir a largura da janela sem passar por cima de uma escolha.
   */
  const wideEnough = useMediaQuery("(min-width: 640px)");
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const showPanel = panelOpen ?? wideEnough;

  const [handSize, setHandSize] = useState(25);
  const [playerCount, setPlayerCount] = useState(10);
  const [finished, setFinished] = useState(false);
  /** A etapa da partida em exibição: cada uma pede uma tela diferente. */
  const [stage, setStage] = useState<MatchStage>("playing_trick");
  /** A rodada às cegas, que troca o leque inteiro por versos. */
  const [blind, setBlind] = useState(false);
  /** As regras da casa, que na mesa de verdade se escolhem na criação. */
  const [cangar, setCangar] = useState(false);
  const [porcao, setPorcao] = useState(false);
  const [nudge, setNudge] = useState(0);
  /** Cartas já jogadas nesta mão: sai a que se clicou, não a última. */
  const [played, setPlayed] = useState<string[]>([]);
  /** A volta da roleta em exibição, se houver uma. */
  const [draft, setDraft] = useState<{ round: number; winnerId: string } | null>(null);

  const hand = useMemo(
    () =>
      Array.from({ length: handSize }, (_, i) => fakeCard(i + nudge * 100)).filter(
        (card) => !played.includes(card.id),
      ),
    [handSize, nudge, played],
  );

  /** Trocar o tamanho da mão reparte de novo — o que já saiu volta. */
  const dealHand = (size: number) => {
    setHandSize(size);
    setPlayed([]);
  };

  const state = useMemo<TableState>(() => {
    const players: PublicPlayer[] = Array.from({ length: playerCount }, (_, i) => ({
      id: i === 0 ? ME : `p${i}`,
      name: NAMES[i % NAMES.length],
      connected: i !== 3,
      points: [10, 8, 3, 1, 7, 5, 9, 2, 6, 4][i % 10],
      // Quem já saiu passou do zero: é o saldo negativo que o fim de partida
      // mostra para separar dois "zero".
      overshoot: i === 5 ? -2 : [10, 8, 3, 1, 7, 5, 9, 2, 6, 4][i % 10],
      // O último ainda não declarou: é assim que a mesa fica no meio das
      // promessas, e é o estado em que o "?" aparece no assento.
      promise: stage === "making_promises" && i === playerCount - 1 ? -1 : i % 3,
      tricks: i % 2,
      eliminated: i === 5,
    }));

    const centre: PublicCard[] = Array.from({ length: Math.min(4, playerCount) }, (_, i) =>
      toPublic(fakeCard(i + 40), i === 0 ? ME : `p${i}`),
    );

    return {
      roomName: "Sexta-feira FDP",
      hostId: ME,
      phase: finished ? "finished" : "playing",
      maxPlayers: 10,
      players,
      currentPlayerId: ME,
      // Sem sorteio em curso: em /mock a roleta é um botão da barra lateral.
      starterId: "",
      deckCount: 34,
      centreCount: centre.length,
      centre,
      winnerId: finished ? "p2" : "",
      winnerIds: finished ? ["p2"] : [],
      log: [
        "Samuel entrou na sala.",
        "Sorteio: Ana Beatriz começa a partida.",
        "Ana Beatriz jogou dama de copas.",
        "Bruno comprou uma carta.",
        "Bruno passou a vez.",
        "Caio jogou ás de espadas.",
        "Dandara jogou 7 de ouros.",
      ],

      stage: finished ? "game_over" : stage,
      round: 4,
      cardsPerPlayer: blind ? 1 : Math.max(1, Math.min(hand.length, 5)),
      maxCards: 0,
      dealerId: "p1",
      trickNumber: 2,
      blind,
      promised: 3,
      lastTrickWinnerId: "p2",
      cangar,
      porcao,
      // O placar só existe no `round_result`, e é lá que a mesa o cobre.
      results:
        stage !== "round_result"
          ? []
          : Array.from({ length: playerCount }, (_, i) => ({
              playerId: i === 0 ? ME : `p${i}`,
              promise: i % 3,
              tricks: (i + 1) % 3,
              lost: Math.abs((i % 3) - ((i + 1) % 3)),
              points: [10, 8, 3, 1, 7, 5, 9, 2, 6, 4][i % 10],
              overshoot: i === 5 ? -2 : [10, 8, 3, 1, 7, 5, 9, 2, 6, 4][i % 10],
              eliminated: i === 5,
            })),
    };
  }, [blind, cangar, finished, hand.length, playerCount, porcao, stage]);

  // Metade das cartas jogáveis, para ver as duas aparências no mesmo leque.
  const playableIds = useMemo(
    () => new Set(hand.filter((_, i) => i % 2 === 0).map((card) => card.id)),
    [hand],
  );

  /*
   * Sem sala, a conversa é um eco local: o emoji que você manda volta como se o
   * servidor o tivesse anunciado. É o que permite rever o balão aqui, com a
   * mesma `Table` e o mesmo `useEmotes` da mesa de verdade.
   */
  const emoteHandlers = useRef(new Set<(event: EmoteEvent) => void>());
  const onEmote = useCallback((handler: (event: EmoteEvent) => void) => {
    const handlers = emoteHandlers.current;
    handlers.add(handler);
    return () => handlers.delete(handler);
  }, []);

  /*
   * Sem servidor não há eventos `fx`, então aqui os voos são disparados à mão.
   * É o mesmo `flights.ts` do jogo — o que se vê em /mock é o que se vê na
   * mesa de verdade, e é o único jeito de revisar a animação sem abrir dois
   * navegadores e arranjar um segundo jogador.
   */
  const actions: RoomActions = {
    start: () => {},
    // A jogada já sai voando pela própria Table, que é quem conhece a carta e o
    // ponto de onde ela partiu. Aqui só falta tirá-la da mão.
    play: (cardId) => setPlayed((ids) => [...ids, cardId]),
    promise: () => setStage("playing_trick"),
    emote: (emote) => {
      for (const handler of emoteHandlers.current) handler({ by: ME, emote });
    },
    restart: () => setFinished(false),
  };

  /*
   * A roleta do sorteio, que na mesa de verdade roda uma vez por partida e some.
   * Aqui ela é um botão, e cada volta tira um nome diferente — o `round` é o que
   * a remonta, senão o segundo clique cairia numa roleta já parada.
   */
  const spin = () => {
    const winner = state.players[Math.floor(Math.random() * state.players.length)];
    const round = (draft?.round ?? 0) + 1;
    setDraft({ round, winnerId: winner.id });
    setTimeout(
      () => setDraft((current) => (current?.round === round ? null : current)),
      STARTER_SPIN,
    );
  };

  /** O reparto inicial inteiro, que de outro jeito só aparece uma vez por partida. */
  const deal = () =>
    flyDeal(
      state.players.map((player) => ({
        seat: player.id === ME ? null : player.id,
        count: Math.max(1, Math.min(hand.length, 5)),
      })),
    );

  return (
    <>
      <Table
        state={state}
        sessionId={ME}
        hand={blind ? [] : hand}
        hiddenIds={blind ? hand.slice(0, 1).map((card) => card.id) : []}
        peek={
          blind
            ? state.players
                .filter((player) => player.id !== ME && !player.eliminated)
                .slice(0, 4)
                .map((player, i) => ({ playerId: player.id, cards: [fakeCard(i + 70)] }))
            : []
        }
        promises={
          stage === "making_promises"
            ? [0, 2, 3, 4, 5].filter((n) => n <= Math.max(1, Math.min(hand.length, 5)))
            : []
        }
        playableIds={playableIds}
        actions={actions}
        onEmote={onEmote}
        onExit={() => setFinished(false)}
      />

      {/*
        A barra já passa da dobra num notebook: daí a altura presa à janela e a
        rolagem própria. `top-16` mais a folga de baixo são as 5rem que saem do
        cálculo. `overscroll-contain` para que chegar ao fim da lista não puxe a
        página atrás — que é a mesa.

        E ela se recolhe: num celular a barra cobre a mesa inteira, que é
        justamente o que se veio olhar. O botão fica no canto em que ela abre,
        e continua na tela quando ela sai — senão não haveria como trazê-la de
        volta.
      */}
      <div className="fixed top-16 right-4 z-30 flex max-h-[calc(100dvh-5rem)] w-56 max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
        <button
          type="button"
          className="px-btn shrink-0"
          onClick={() => setPanelOpen(!showPanel)}
          aria-expanded={showPanel}
        >
          {showPanel ? "esconder ▸" : "▤ mock"}
        </button>

        {showPanel && (
          <div className="px-slab fdp-mock-panel flex min-h-0 w-full flex-col gap-3 overflow-y-auto overscroll-contain p-3">
            <Slider label="Cartas na mão" value={handSize} min={1} max={30} onChange={dealHand} />
            <Slider
              label="Jogadores"
              value={playerCount}
              min={2}
              max={10}
              onChange={setPlayerCount}
            />

            <Toggle
              label="Fim de partida"
              on={finished}
              onClick={() => setFinished((v) => !v)}
            />

            {/* As etapas da partida: cada uma pede uma tela diferente de quem
                joga — os botões da promessa, o leque, o placar. */}
            <label className="flex flex-col gap-1">
              <span className="px-label">Etapa</span>
              <select
                className="px-input"
                value={stage}
                onChange={(event) => setStage(event.target.value as MatchStage)}
              >
                <option value="making_promises">promessas</option>
                <option value="playing_trick">jogando a mão</option>
                <option value="round_result">placar da rodada</option>
              </select>
            </label>

            <Toggle
              label="Rodada às cegas"
              on={blind}
              onClick={() => setBlind((v) => !v)}
            />
            <Toggle label="Cangar" on={cangar} onClick={() => setCangar((v) => !v)} />
            <Toggle label="Porcão" on={porcao} onClick={() => setPorcao((v) => !v)} />

            <button
              type="button"
              className="px-btn"
              onClick={() => {
                setNudge((n) => n + 1);
                setPlayed([]);
              }}
            >
              Outra mão
            </button>
            <button type="button" className="px-btn" onClick={deal}>
              Repartir
            </button>
            <button type="button" className="px-btn" onClick={spin}>
              Sortear quem começa
            </button>
            <p className="px-label">
              Clique numa carta para jogar. O pano da mesa está nos ajustes, no
              cabeçalho.
            </p>
          </div>
        )}
      </div>

      {draft && (
        <StarterRoulette key={draft.round} players={state.players} winnerId={draft.winnerId} />
      )}

      <FlightLayer />
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="px-label">
        {label} · {value}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ accentColor: "var(--mark)" }}
      />
    </label>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-btn flex items-center gap-2 text-left"
      aria-pressed={on}
    >
      <span
        className="inline-block size-3 shrink-0"
        style={{
          background: on ? "var(--mark)" : "var(--slab-sh)",
          border: "2px solid var(--rim)",
        }}
      />
      {label}
    </button>
  );
}
