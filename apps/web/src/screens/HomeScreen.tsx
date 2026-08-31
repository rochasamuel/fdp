import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  MAX_CARDS_CAP,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RULES,
  type CreateRoomOptions,
  type HouseRules,
} from "@fdp/shared";
import { backUrl } from "../lib/cards";
import { ROOM_NAME, client } from "../lib/colyseus";
import { setPendingRoom } from "../lib/pendingRoom";
import { navigate } from "../lib/router";
import { loadSetup, newSeatKey, saveSession, saveSetup } from "../lib/session";
import { useUi } from "../store/ui";

export function HomeScreen() {
  const playerName = useUi((ui) => ui.playerName);
  const setPlayerName = useUi((ui) => ui.setPlayerName);
  const back = useUi((ui) => ui.back);
  // A mesa nasce como foi a última: quem joga toda semana não redigita o mesmo
  // nome toda semana. Lido uma vez, na montagem.
  const [setup] = useState(loadSetup);
  const [roomName, setRoomName] = useState(setup.roomName);
  const [maxPlayers, setMaxPlayers] = useState(setup.maxPlayers);
  const [maxCards, setMaxCards] = useState(setup.maxCards);
  const [rules, setRules] = useState<HouseRules>({
    cangar: setup.cangar,
    porcao: setup.porcao,
  });
  const [code, setCode] = useState("");

  const createRoom = useMutation({
    mutationFn: async (options: CreateRoomOptions) => {
      const room = await client.create(ROOM_NAME, options);
      saveSession(room.roomId, {
        reconnectionToken: room.reconnectionToken,
        playerName: options.playerName,
        // A mesma chave que foi na criação: é ela que devolve a cadeira ao host
        // se ele cair antes de a partida acabar.
        seatKey: options.seatKey,
      });
      // Depois de a sala existir, e não no envio: o que se guarda é um
      // combinado que deu certo, não uma tentativa.
      saveSetup({
        roomName: options.roomName,
        maxPlayers: options.maxPlayers,
        maxCards: options.maxCards ?? 0,
        cangar: options.cangar === true,
        porcao: options.porcao === true,
      });
      setPendingRoom(room);
      return room.roomId;
    },
    onSuccess: (roomId) => navigate(`/room/${roomId}`),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      {/* O logotipo do jogo é a própria carta: o verso do baralho, na mesma
          trama e na mesma paleta que a mesa inteira usa. */}
      <img src={backUrl(back)} alt="FDP" className="fdp-card mx-auto" style={{ width: 132 }} />

      <form
        className="px-slab flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          createRoom.mutate({
            roomName,
            playerName,
            maxPlayers,
            maxCards,
            ...rules,
            seatKey: newSeatKey(),
          });
        }}
      >
        <h1 className="px-title">Abrir uma mesa</h1>

        <label className="flex flex-col gap-1">
          <span className="px-label">Nome da mesa</span>
          <input
            className="px-input"
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            maxLength={40}
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="px-label">Seu nome</span>
          <input
            className="px-input"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            maxLength={16}
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="px-label">Lugares na mesa · {maxPlayers}</span>
          <input
            type="range"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            value={maxPlayers}
            onChange={(event) => setMaxPlayers(Number(event.target.value))}
            style={{ accentColor: "var(--mark)" }}
          />
        </label>

        {/*
          O teto de cartas por rodada.

          O ciclo sobe até o baralho não dar mais: numa mesa de três isso é uma
          rodada de dezessete cartas, que ninguém segura na mão nem na cabeça. O
          teto corta o ciclo antes disso — chegou nele, a rodada seguinte volta
          para uma carta. Zero é o jogo como sempre foi, e é por isso que ele é
          o começo da faixa e não um valor no meio dela.
        */}
        <label className="flex flex-col gap-1">
          <span className="px-label">
            Máximo de cartas por rodada ·{" "}
            {maxCards === 0 ? "o que o baralho der" : maxCards}
          </span>
          <input
            type="range"
            min={0}
            max={MAX_CARDS_CAP}
            value={maxCards}
            onChange={(event) => setMaxCards(Number(event.target.value))}
            style={{ accentColor: "var(--mark)" }}
          />
        </label>

        {/*
          As regras da casa. Ficam na CRIAÇÃO e em lugar nenhum mais: elas mudam
          o que uma carta vale, e trocá-las no meio da partida seria mudar a mão
          que as pessoas já viram. Desligadas por padrão — quem nunca jogou
          aprende o jogo base primeiro.
        */}
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="px-label pb-1">Regras da casa · opcionais</legend>
          {/* A mesma lista que o painel do cabeçalho lê durante a partida: o
              que se escolhe aqui e o que se confere lá são a mesma frase. */}
          {RULES.map(({ key, label, hint }) => (
            <HouseRule
              key={key}
              label={label}
              hint={hint}
              on={rules[key]}
              onToggle={() => setRules((current) => ({ ...current, [key]: !current[key] }))}
            />
          ))}
        </fieldset>

        <button
          type="submit"
          disabled={createRoom.isPending}
          className="px-btn px-btn-primary"
        >
          {createRoom.isPending ? "Abrindo…" : "Abrir mesa"}
        </button>
        {createRoom.isError && (
          <p className="px-label" style={{ color: "var(--ink-red)" }}>
            {createRoom.error.message}
          </p>
        )}
      </form>

      {/* A porta do tutorial fica ao lado da porta da mesa, e não escondida
          num canto: o FDP é um jogo em que a primeira partida de quem não leu
          as regras estraga a de mais cinco pessoas. */}
      <button
        type="button"
        className="px-btn"
        onClick={() => navigate("/aprender")}
      >
        📖 Aprenda a jogar
      </button>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(`/room/${code.trim().toUpperCase()}`);
        }}
      >
        <label className="flex flex-1 flex-col gap-1">
          <span className="px-label">Entrar com um código</span>
          <input
            className="px-input uppercase"
            placeholder="A7K92"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={8}
            required
          />
        </label>
        <button type="submit" className="px-btn">
          Entrar
        </button>
      </form>

      {/*
        O crédito fecha a porta de entrada, e mora só aqui: na mesa ele
        disputaria o canto com a vez de alguém, e a mesa é para jogar. No tom
        mais apagado da folha — quem vem abrir uma partida não veio ler um
        nome, mas quem for procurar acha.
      */}
      <footer className="px-label flex flex-wrap items-baseline justify-center gap-x-2">
        <span>desenvolvido por</span>
        <a
          className="px-link px-credit"
          href="https://github.com/rochasamuel"
          target="_blank"
          rel="noopener noreferrer"
        >
          Samuel Rocha ↗
        </a>
      </footer>
    </main>
  );
}

/**
 * Um interruptor de regra: o estado à esquerda, o nome e a explicação à
 * direita. A explicação não é opcional — "Cangar" não diz nada a quem nunca
 * jogou, e uma regra que muda o que a carta vale não pode entrar na mesa por
 * um nome que ninguém entendeu.
 */
function HouseRule({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="fdp-rule flex items-start gap-3 text-left"
    >
      <span className="fdp-rule-box" aria-hidden>
        {on ? "✕" : ""}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm" style={{ color: on ? "var(--mark)" : "var(--paper)" }}>
          {label}
        </span>
        <span className="px-label" style={{ letterSpacing: "0.06em", textTransform: "none" }}>
          {hint}
        </span>
      </span>
    </button>
  );
}
