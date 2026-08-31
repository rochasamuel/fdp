import { useState } from "react";
import { MIN_PLAYERS } from "@fdp/shared";
import { FlightLayer } from "../components/FlightLayer";
import { StarterRoulette } from "../components/StarterRoulette";
import { Table } from "../components/Table";
import { useFlights } from "../game/useFlights";
import { useRoomConnection } from "../game/useRoomConnection";
import { navigate, roomUrl } from "../lib/router";
import { useUi } from "../store/ui";

export function RoomScreen({ code }: { code: string }) {
  const connection = useRoomConnection(code);
  const { state, status } = connection;

  // Aqui, e não dentro da Table: o reparto inicial é anunciado antes de a mesa
  // existir, e quem assina os eventos precisa já estar de pé.
  useFlights(state, connection.sessionId, connection.onFx);

  const exit = () => {
    connection.leave();
    navigate("/");
  };

  return (
    <>
      {status === "naming" && (
        <NameGate code={code} error={connection.error} onJoin={connection.join} />
      )}

      {status === "lost" && (
        <Disconnected error={connection.error} onRetry={connection.retry} onExit={exit} />
      )}

      {status === "connecting" && <Centered title="Conectando" />}

      {status === "connected" && !state && <Centered title="Sincronizando" />}

      {status === "connected" && state && state.phase === "lobby" && (
        <Lobby code={code} connection={connection} />
      )}

      {status === "connected" && state && state.phase !== "lobby" && (
        <Table
          state={state}
          sessionId={connection.sessionId}
          hand={connection.hand}
          hiddenIds={connection.hiddenIds}
          peek={connection.peek}
          promises={connection.promises}
          playableIds={connection.playableIds}
          actions={connection.actions}
          onEmote={connection.onEmote}
          onExit={exit}
        />
      )}

      {/* Um sorteado publicado é um sorteio em curso, e nada mais: o servidor o
          apaga ao repartir. Vale para a primeira partida e para cada revanche,
          e é o que impede a roleta de reaparecer sobre o fim da partida. */}
      {state?.starterId && (
        <StarterRoulette players={state.players} winnerId={state.starterId} />
      )}

      <FlightLayer />

      {connection.dropped && (
        <p
          className="px-label fixed inset-x-0 top-0 z-50 py-1 text-center"
          style={{ background: "var(--mark)", color: "var(--ink)" }}
        >
          Conexão caiu · reconectando
        </p>
      )}

      {connection.notice && (
        <p
          className="px-slab px-label fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm px-4 py-2 text-center"
          style={{ color: "var(--mark)" }}
        >
          {connection.notice}
        </p>
      )}
    </>
  );
}

function Lobby({
  code,
  connection,
}: {
  code: string;
  connection: ReturnType<typeof useRoomConnection>;
}) {
  const [copied, setCopied] = useState(false);
  const state = connection.state!;
  const isHost = state.hostId === connection.sessionId;
  const canShare = typeof navigator.share === "function";

  const copy = async () => {
    await navigator.clipboard.writeText(roomUrl(code));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  /*
   * A folha de compartilhamento do sistema abre por cima da página em vez de
   * mandar o host para outro app. É a diferença entre a aba continuar viva e o
   * celular congelá-la — e era congelando que a mesa recém-criada morria antes
   * de alguém receber o código. Sem suporte, copiar continua servindo.
   */
  const invite = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({
        title: state.roomName,
        text: `Entre na minha mesa de FDP. Código: ${code}`,
        url: roomUrl(code),
      });
    } catch {
      // Cancelar a folha é uma resposta, não um erro: nada a fazer.
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <div className="px-slab flex flex-col items-center gap-2 p-5">
        <h1 className="px-title">{state.roomName}</h1>
        <p className="px-label">Código da mesa</p>
        <p className="px-code">{code}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="px-label">Link do convite</span>
            <input readOnly value={roomUrl(code)} className="px-input text-xs" />
          </label>
          <button type="button" onClick={copy} className="px-btn">
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        {canShare && (
          <button type="button" onClick={invite} className="px-btn">
            Convidar por outro app
          </button>
        )}
      </div>

      <div className="px-slab flex flex-col gap-2 p-5">
        <p className="px-label">
          Jogadores · {state.players.length} de {state.maxPlayers}
        </p>
        <ul className="flex flex-col gap-1">
          {state.players.map((player) => (
            <li key={player.id} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block size-2"
                style={{ background: player.connected ? "var(--live)" : "var(--gloss)" }}
              />
              {player.id === state.hostId && "👑"}
              <span style={{ color: "var(--paper-hi)" }}>{player.name}</span>
              {player.id === connection.sessionId && (
                <span className="px-label">você</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <button
          type="button"
          onClick={connection.actions.start}
          disabled={state.players.length < MIN_PLAYERS}
          className="px-btn px-btn-primary"
        >
          {state.players.length < MIN_PLAYERS
            ? `Faltam ${MIN_PLAYERS - state.players.length} para começar`
            : "Começar a partida"}
        </button>
      ) : (
        <p className="px-label text-center">
          Aguardando o host começar<span className="px-caret">▌</span>
        </p>
      )}

      {/* Esperar os outros chegarem é o único tempo morto da partida — e é
          exatamente o tempo de que quem nunca jogou precisa. */}
      <button type="button" onClick={() => navigate("/aprender")} className="px-btn">
        📖 Aprenda a jogar
      </button>

      <button
        type="button"
        onClick={() => {
          connection.leave();
          navigate("/");
        }}
        className="px-link"
      >
        sair da mesa
      </button>
    </main>
  );
}

function NameGate({
  code,
  error,
  onJoin,
}: {
  code: string;
  error: string;
  onJoin: (name: string) => void;
}) {
  const playerName = useUi((ui) => ui.playerName);
  const setPlayerName = useUi((ui) => ui.setPlayerName);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-6">
      <div className="px-slab flex flex-col items-center gap-2 p-5">
        <p className="px-label">Entrando na mesa</p>
        <p className="px-code">{code}</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onJoin(playerName.trim());
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="px-label">Seu nome</span>
          <input
            className="px-input"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            maxLength={16}
            required
            autoFocus
          />
        </label>
        <button type="submit" className="px-btn px-btn-primary">
          Sentar à mesa
        </button>
      </form>

      {error && (
        <p className="px-label" style={{ color: "var(--ink-red)" }}>
          {error}
        </p>
      )}
      <button type="button" onClick={() => navigate("/")} className="px-link">
        voltar ao início
      </button>
    </main>
  );
}

/**
 * Recarregar a página era o botão errado: o token do lugar está no
 * localStorage, então tentar de novo é só refazer o caminho de conexão — e o
 * hook já refaz sozinho quando a aba volta ao primeiro plano. O botão fica para
 * quem voltou antes de o servidor perceber a queda.
 */
function Disconnected({
  error,
  onRetry,
  onExit,
}: {
  error: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <Centered title="Fora da partida">
      <p className="text-sm" style={{ color: "var(--paper-sh)" }}>
        {error || "O lugar na mesa não pôde ser recuperado."}
      </p>
      <div className="flex justify-center gap-3">
        <button type="button" onClick={onRetry} className="px-btn px-btn-primary">
          Tentar de novo
        </button>
        <button type="button" onClick={onExit} className="px-btn">
          Início
        </button>
      </div>
    </Centered>
  );
}

function Centered({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-content-center p-6">
      <div className="px-slab flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="px-title">
          {title}
          <span className="px-caret">▌</span>
        </h1>
        {children}
      </div>
    </main>
  );
}
