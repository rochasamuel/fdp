import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import type {
  Card,
  Emote,
  EmoteEvent,
  EmoteMessage,
  ErrorMessage,
  FxEvent,
  FxMessage,
  HandMessage,
  JoinRoomOptions,
  PeekedHand,
  PlayMessage,
  PromiseMessage,
  TableState,
} from "@fdp/shared";
import { client } from "../lib/colyseus";
import { takePendingRoom } from "../lib/pendingRoom";
import {
  clearSession,
  loadPlayerName,
  loadSession,
  saveSession,
  seatKeyFor,
} from "../lib/session";

export type ConnectionStatus = "connecting" | "naming" | "connected" | "lost";

const EMPTY_HAND: HandMessage = {
  cards: [],
  hiddenIds: [],
  playableIds: [],
  peek: [],
  promises: [],
};

export type RoomConnection = {
  status: ConnectionStatus;
  /** Ligado enquanto o socket está caído e o SDK tenta de novo. */
  dropped: boolean;
  error: string;
  /** A última recusa do servidor, mostrada por um instante e dispensada. */
  notice: string;
  state: TableState | null;
  hand: Card[];
  /**
   * As cartas que estão na sua mão e que você NÃO pode ver — a rodada às
   * cegas. São ids e nada mais: o servidor não mandou o naipe nem o valor.
   */
  hiddenIds: string[];
  playableIds: Set<string>;
  /** As mãos dos adversários, abertas na rodada às cegas. */
  peek: PeekedHand[];
  /** As promessas que você pode declarar agora. Vazio fora da sua vez. */
  promises: number[];
  sessionId: string;
  join: (playerName: string) => Promise<void>;
  /** Tenta voltar para a mesa depois de o lugar ter sido perdido. */
  retry: () => void;
  leave: () => void;
  actions: RoomActions;
  /**
   * Assina os eventos de animação. Não é estado do React de propósito: eles
   * descrevem um instante, não uma situação, e guardá-los em `useState` obrigaria
   * quem consome a limpar a fila — com a corrida de sempre entre esvaziar e
   * receber. Devolve a função que cancela a assinatura.
   */
  onFx: (handler: (events: FxEvent[]) => void) => () => void;
  /** Assina a conversa da mesa, pelo mesmo motivo e do mesmo jeito que `onFx`. */
  onEmote: (handler: (event: EmoteEvent) => void) => () => void;
};

export type RoomActions = {
  start: () => void;
  play: (cardId: string) => void;
  /** Declara quantas vazas você vai fazer nesta rodada. */
  promise: (promise: number) => void;
  /** Falar com a mesa. Vale em qualquer momento, inclusive fora da sua vez. */
  emote: (emote: Emote) => void;
  restart: () => void;
};

export function useRoomConnection(code: string): RoomConnection {
  const roomRef = useRef<Room | null>(null);
  const fxHandlers = useRef(new Set<(events: FxEvent[]) => void>());
  const emoteHandlers = useRef(new Set<(event: EmoteEvent) => void>());
  /** Uma tentativa de cada vez, e nenhuma depois que a tela sai. */
  const busy = useRef(false);
  const alive = useRef(true);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [dropped, setDropped] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<TableState | null>(null);
  const [hand, setHand] = useState<HandMessage>(EMPTY_HAND);
  const [sessionId, setSessionId] = useState("");

  const attach = useCallback(
    (room: Room, playerName: string, seatKey: string) => {
      roomRef.current = room;
      setSessionId(room.sessionId);
      setStatus("connected");
      setDropped(false);
      setError("");
      let token = room.reconnectionToken;
      saveSession(code, { reconnectionToken: token, playerName, seatKey });

      room.onStateChange(() => {
        /*
         * O token do Colyseus TROCA a cada reconexão, e guardá-lo só no
         * `onReconnect` deixava uma fresta: a aba que morre entre a troca e a
         * gravação volta com uma chave morta na mão. Aqui ele é conferido a
         * cada patch — uma comparação de string, e a escrita só quando de fato
         * mudou. A `seatKey` cobre o resto, mas uma fresta a menos é uma volta
         * a mais que acontece pelo caminho curto.
         */
        if (room.reconnectionToken !== token) {
          token = room.reconnectionToken;
          saveSession(code, { reconnectionToken: token, playerName, seatKey });
        }
        setState(room.state.toJSON() as TableState);
      });
      room.onMessage("hand", (message: HandMessage) => setHand(message));
      room.onMessage("error", (message: ErrorMessage) => setNotice(message.message));
      room.onMessage("fx", (events: FxMessage) => {
        for (const handler of fxHandlers.current) handler(events);
      });
      room.onMessage("emote", (event: EmoteEvent) => {
        for (const handler of emoteHandlers.current) handler(event);
      });
      room.onDrop(() => setDropped(true));
      room.onReconnect(() => {
        setDropped(false);
        token = room.reconnectionToken;
        saveSession(code, { reconnectionToken: token, playerName, seatKey });
      });
      room.onLeave(() => {
        roomRef.current = null;
        setStatus("lost");
        setHand(EMPTY_HAND);
      });
    },
    [code],
  );

  const join = useCallback(
    async (playerName: string) => {
      setStatus("connecting");
      setError("");
      const seatKey = seatKeyFor(code);
      try {
        const room = await client.joinById(code, {
          playerName,
          seatKey,
        } satisfies JoinRoomOptions);
        if (!alive.current) return void room.leave();
        attach(room, playerName, seatKey);
      } catch (cause) {
        // Sem `clearSession`: uma entrada nova que falhou não diz nada sobre um
        // lugar guardado de antes, e apagar o token aqui fecharia a única porta
        // que ainda pode abrir. Quem sai de fato apaga o dele em `leave`.
        setError(joinError(cause));
        setStatus("naming");
      }
    },
    [attach, code],
  );

  /**
   * O caminho de volta para a mesa, em ordem de preferência: a sala que a tela
   * inicial já abriu, o token que guarda o lugar, e por fim uma entrada nova
   * pelo nome. Serve tanto para a primeira vez quanto para a volta depois de o
   * celular congelar a aba — é o mesmo caminho, e a única diferença é que na
   * volta já existe um token para gastar.
   */
  const connect = useCallback(async () => {
    if (roomRef.current || busy.current || !alive.current) return;
    busy.current = true;
    const saved = loadSession(code);

    try {
      const seatKey = seatKeyFor(code);
      const handedOver = takePendingRoom(code);
      if (handedOver) {
        return attach(handedOver, saved?.playerName ?? loadPlayerName(), seatKey);
      }

      const name = saved?.playerName || loadPlayerName();
      // Sem token e sem nome não há o que tentar: quem chega assim vem do link
      // de convite e precisa se apresentar primeiro.
      if (!saved?.reconnectionToken && !name) return setStatus("naming");

      setStatus("connecting");
      setError("");

      if (saved?.reconnectionToken) {
        const room = await reclaimSeat(saved.reconnectionToken, () => alive.current);
        if (!alive.current) return void room?.leave();
        if (room) return attach(room, saved.playerName, seatKey);
        // O token NÃO é descartado aqui. Falhar em reclamar o lugar não prova
        // que ele acabou — prova que não deu desta vez. E não é mais a única
        // porta: a entrada logo abaixo leva a `seatKey`, que o servidor
        // reconhece enquanto a cadeira estiver guardada.
      }

      if (!name) return setStatus("naming");

      try {
        const room = await client.joinById(code, {
          playerName: name,
          seatKey,
        } satisfies JoinRoomOptions);
        if (!alive.current) return void room.leave();
        attach(room, name, seatKey);
      } catch (cause) {
        if (!alive.current) return;
        setError(joinError(cause));
        // Quem nunca sentou precisa do formulário de nome; quem já estava na
        // mesa precisa do motivo e de um botão para tentar de novo.
        setStatus(saved ? "lost" : "naming");
      }
    } finally {
      busy.current = false;
    }
  }, [attach, code]);

  useEffect(() => {
    alive.current = true;
    void connect();

    return () => {
      alive.current = false;
      roomRef.current?.removeAllListeners();
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, [connect]);

  /**
   * Trocar de app para mandar o link é o jeito normal de convidar alguém, e o
   * celular responde congelando a aba: o socket morre e o SDK gasta as
   * tentativas dele no vazio. Voltar para a aba é o sinal de que dá para tentar
   * de novo — e é aqui, não num botão, que a mesa precisa se recuperar sozinha.
   */
  useEffect(() => {
    const recover = () => {
      if (document.visibilityState !== "visible") return;
      /*
       * A mesa que sobreviveu ao congelamento volta exibindo o quadro em que
       * parou: o Colyseus manda o que MUDOU, e o que mudou passou enquanto a
       * aba dormia. Pedir tudo de novo custa uma mensagem e é a diferença
       * entre uma tela velha e uma tela certa — quem olha para ela não tem
       * como desconfiar, e uma tela velha já travou uma mesa inteira.
       */
      try {
        roomRef.current?.send("resync");
      } catch {
        // socket já morto: o `connect` abaixo é quem cuida deste caso
      }
      void connect();
    };
    document.addEventListener("visibilitychange", recover);
    addEventListener("online", recover);
    addEventListener("pageshow", recover);
    return () => {
      document.removeEventListener("visibilitychange", recover);
      removeEventListener("online", recover);
      removeEventListener("pageshow", recover);
    };
  }, [connect]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const retry = useCallback(() => void connect(), [connect]);

  const leave = useCallback(() => {
    roomRef.current?.leave(true);
    roomRef.current = null;
    clearSession(code);
  }, [code]);

  const actions = useMemo<RoomActions>(
    () => ({
      start: () => roomRef.current?.send("start"),
      play: (cardId) => roomRef.current?.send("play", { cardId } satisfies PlayMessage),
      promise: (promise) =>
        roomRef.current?.send("promise", { promise } satisfies PromiseMessage),
      emote: (emote) => roomRef.current?.send("emote", { emote } satisfies EmoteMessage),
      restart: () => roomRef.current?.send("restart"),
    }),
    [],
  );

  const onFx = useCallback((handler: (events: FxEvent[]) => void) => {
    const handlers = fxHandlers.current;
    handlers.add(handler);
    return () => handlers.delete(handler);
  }, []);

  const onEmote = useCallback((handler: (event: EmoteEvent) => void) => {
    const handlers = emoteHandlers.current;
    handlers.add(handler);
    return () => handlers.delete(handler);
  }, []);

  const playableIds = useMemo(() => new Set(hand.playableIds), [hand]);

  return {
    status,
    dropped,
    error,
    notice,
    state,
    hand: hand.cards,
    hiddenIds: hand.hiddenIds,
    peek: hand.peek,
    promises: hand.promises,
    playableIds,
    sessionId,
    join,
    retry,
    leave,
    actions,
    onFx,
    onEmote,
  };
}

/**
 * Quanto esperar entre uma tentativa de reclamar o lugar e a seguinte.
 *
 * Recarregar a página é uma corrida: o navegador fecha o socket e a mesa
 * renasce no quadro seguinte, cedo demais para o servidor já ter registrado a
 * reserva do assento. Uma tentativa só perdia essa corrida — e o preço de
 * perdê-la era a partida, porque a sala está trancada e não há segunda porta.
 * Três tentativas em pouco mais de um segundo cobrem a corrida sem fazer
 * ninguém esperar por um assento que de fato acabou.
 */
const RECLAIM_BACKOFF = [0, 400, 1200];

async function reclaimSeat(token: string, alive: () => boolean): Promise<Room | null> {
  for (const wait of RECLAIM_BACKOFF) {
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    if (!alive()) return null;
    try {
      return await client.reconnect(token);
    } catch {
      // ainda não; a próxima volta tenta de novo
    }
  }
  return null;
}

function joinError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/not found|locked|no rooms|full/i.test(message)) {
    return "Sala não encontrada, cheia ou com partida já em andamento.";
  }
  return message || "Não foi possível entrar na sala.";
}
