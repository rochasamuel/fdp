import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { MAX_PLAYERS, STARTING_POINTS } from "@fdp/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import appConfig from "../app.config.js";
import type { TableGame } from "../game/TableGame.js";
import type { TableRoom } from "./TableRoom.js";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(appConfig, 2568);
});
afterAll(() => colyseus.shutdown());
afterEach(() => colyseus.cleanup());

/** Uma sala com gente dentro, e o silêncio depois de todo mundo sentar. */
async function seated(count: number) {
  const room = await colyseus.createRoom<TableRoom>("table", { roomName: "Mesa" });
  const clients = [];
  for (let i = 0; i < count; i++) {
    clients.push(await colyseus.connectTo(room, { playerName: `P${i}` }));
  }
  // O `sync` da última entrada ainda está a caminho: esperá-lo aqui é o que
  // impede um `hand` de boas-vindas de passar por resposta a uma recusa.
  await room.waitForNextPatch();
  return { room, clients };
}

/** O motor por trás da sala, e o `sync` que o espelha no estado. */
function engine(room: TableRoom) {
  const inner = room as unknown as { game: TableGame; sync: () => void };
  return { game: inner.game, sync: () => inner.sync() };
}

/** A partida começada na marra, sem os dois segundos e meio da roleta. */
async function dealt(count: number) {
  const seats = await seated(count);
  const parts = engine(seats.room);
  parts.game.start();
  parts.sync();
  await Promise.all(seats.clients.map((c) => c.waitForMessage("hand", 1000)));
  return { ...seats, ...parts };
}

/**
 * A mesma partida, já com todas as promessas declaradas: é o estado em que se
 * pode baixar carta. Cada um escolhe a primeira promessa que o servidor deixa,
 * que é justamente o que o cliente faria.
 */
async function playing(count: number) {
  const table = await dealt(count);
  while (table.game.stage === "making_promises") {
    const turn = table.game.currentPlayer!;
    table.game.makePromise(turn.id, table.game.promiseOptions(turn.id)[0]);
  }
  table.sync();
  return table;
}

describe("a mesa", () => {
  it("senta todo mundo, e o primeiro a chegar é o host", async () => {
    const { room, clients } = await seated(3);

    expect([...room.state.players].map((p) => p.name)).toEqual(["P0", "P1", "P2"]);
    expect(room.state.hostId).toBe(clients[0].sessionId);
    expect(room.state.phase).toBe("lobby");
  });

  it("passa o host adiante quando ele sai", async () => {
    const { room, clients } = await seated(3);

    await clients[0].leave();
    await room.waitForNextPatch();

    expect(room.state.hostId).toBe(clients[1].sessionId);
  });

  it("reparte a mão de cada um, e só para o dono", async () => {
    const { room, clients } = await dealt(3);

    expect(room.state.phase).toBe("playing");
    // A rodada 1 é de uma carta só, e é a rodada às cegas.
    expect(room.state.cardsPerPlayer).toBe(1);
    expect(room.state.blind).toBe(true);
    // A prova de que a mão é privada: o estado sincronizado não a carrega.
    expect(JSON.stringify(clients[0].state)).not.toContain('"hand"');
  });
});

describe("uma ação recusada", () => {
  /*
   * O buraco que travou uma mesa de verdade: a recusa saía sozinha, sem estado
   * atrás dela. Quem tivesse divergido do servidor — por um patch perdido, uma
   * aba congelada, o que for — ficava preso olhando uma tela que não existia
   * mais, porque nada no jogo voltava a escrever nela.
   */
  it("reescreve a mesa de quem tentou", async () => {
    const { clients } = await seated(3);
    const notHost = clients[1];

    const corrected = notHost.waitForMessage("hand", 1000);
    const refused = notHost.waitForMessage("error", 1000);
    notHost.send("start");

    await expect(refused).resolves.toMatchObject({ message: /Apenas o host/ });
    await expect(corrected).resolves.toBeDefined();
  });

  it("não reescreve a mesa de quem não tentou nada", async () => {
    const { clients } = await seated(3);

    const quiet = clients[2].waitForMessage("hand", 400);
    clients[1].send("start");
    await clients[1].waitForMessage("error", 1000);

    await expect(quiet).rejects.toBeDefined();
  });

  it("recusa a jogada de quem não tem a vez", async () => {
    const { clients, game } = await playing(3);
    const waiting = clients.find((c) => c.sessionId !== game.currentPlayer!.id)!;

    const refused = waiting.waitForMessage("error", 1000);
    waiting.send("play", { cardId: "c0" });

    await expect(refused).resolves.toMatchObject({ message: /Não é a sua vez/ });
  });
});

/*
 * A regra pelo caminho de verdade: a mensagem do cliente, a validação no
 * servidor, o estado espelhado de volta. O motor já é testado em
 * `game/TableGame.test.ts` — o que se confere aqui é que a sala liga um no
 * outro, e que uma intenção inválida vira aviso em vez de estado torto.
 */
describe("a regra pela sala", () => {
  /*
   * As regras da casa chegam pela criação da mesa e vão parar no estado
   * público. As duas coisas importam: sem a primeira o motor joga o jogo base
   * achando que obedeceu, e sem a segunda a mesa não tem como avisar que uma
   * carta vale outra coisa hoje.
   */
  it("nasce sem regra opcional nenhuma", async () => {
    const { room } = await seated(2);
    expect(room.state.cangar).toBe(false);
    expect(room.state.porcao).toBe(false);
    expect(engine(room).game.rules).toEqual({ cangar: false, porcao: false });
  });

  it("leva as regras da criação para o motor e para a mesa", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      roomName: "Mesa",
      cangar: true,
      porcao: true,
    });
    await colyseus.connectTo(room, { playerName: "Ana" });
    await room.waitForNextPatch();

    expect(engine(room).game.rules).toEqual({ cangar: true, porcao: true });
    expect(room.state.cangar).toBe(true);
    expect(room.state.porcao).toBe(true);
  });

  /*
   * Os pontos da mesa são combinados na criação, como as regras. O que chega
   * fora da faixa não pode virar uma mesa esquisita — de zero pontos, em que
   * todo mundo já sentou eliminado —, então ele vira o padrão de sempre.
   */
  it("senta todo mundo com os pontos combinados na criação", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      roomName: "Mesa",
      startingPoints: 50,
    });
    await colyseus.connectTo(room, { playerName: "Ana" });
    await room.waitForNextPatch();

    expect(room.state.startingPoints).toBe(50);
    expect([...room.state.players][0].points).toBe(50);
  });

  it("volta ao padrão quando os pontos pedidos não cabem na faixa", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", {
      roomName: "Mesa",
      startingPoints: 900,
    });
    await colyseus.connectTo(room, { playerName: "Ana" });
    await room.waitForNextPatch();

    expect(room.state.startingPoints).toBe(STARTING_POINTS);
    expect([...room.state.players][0].points).toBe(STARTING_POINTS);
  });

  it("aceita a promessa de quem tem a vez e a espelha para a mesa", async () => {
    const { room, clients, game } = await dealt(3);
    const turn = clients.find((c) => c.sessionId === game.currentPlayer!.id)!;

    turn.send("promise", { promise: 0 });
    await room.waitForNextPatch();

    const entry = [...room.state.players].find((p) => p.id === turn.sessionId)!;
    expect(entry.promise).toBe(0);
    expect(room.state.promised).toBe(0);
    expect(room.state.stage).toBe("making_promises");
  });

  it("recusa a promessa que faria a soma bater com o número de cartas", async () => {
    const { room, clients, game } = await dealt(3);
    // Uma carta cada. Os dois primeiros dizem 0 e 1: o último fica obrigado a 1.
    const order = [0, 1].map(() => {
      const id = game.currentPlayer!.id;
      const client = clients.find((c) => c.sessionId === id)!;
      return client;
    });
    order[0].send("promise", { promise: 0 });
    await room.waitForNextPatch();
    const second = clients.find((c) => c.sessionId === game.currentPlayer!.id)!;
    second.send("promise", { promise: 1 });
    await room.waitForNextPatch();

    const last = clients.find((c) => c.sessionId === game.currentPlayer!.id)!;
    const refused = last.waitForMessage("error", 1000);
    last.send("promise", { promise: 0 });

    await expect(refused).resolves.toMatchObject({ message: /não pode dar 1/ });
    expect(room.state.stage).toBe("making_promises");
  });

  /*
   * A prova de que a rodada às cegas é uma limitação de verdade: o naipe e o
   * valor da SUA carta não saem do servidor. Se um dia saírem, este teste cai —
   * e é para cair, porque aí o segredo seria só um verso desenhado por cima.
   */
  it("manda a mão às cegas sem naipe nem valor, e a dos outros aberta", async () => {
    const { clients, game } = await dealt(3);

    const asked = clients[0].waitForMessage("hand", 1000);
    clients[0].send("resync");
    const mao = await asked;

    const minha = game.players.find((p) => p.id === clients[0].sessionId)!;
    expect(mao.cards).toEqual([]);
    expect(mao.hiddenIds).toEqual(minha.hand.map((c) => c.id));
    // Nenhum objeto de carta do envelope descreve a carta que é minha: o id
    // dela aparece, e o par (naipe, valor) não sai do servidor.
    const descritas = [...mao.cards, ...mao.peek.flatMap((seat) => seat.cards)];
    expect(descritas.some((c: { id: string }) => c.id === minha.hand[0].id)).toBe(false);

    // E a dos outros, aberta: é com ela que se decide a promessa.
    expect(mao.peek.map((seat: { playerId: string }) => seat.playerId).sort()).toEqual(
      clients
        .slice(1)
        .map((c) => c.sessionId)
        .sort(),
    );
  });
});

describe("um pedido de resync", () => {
  /*
   * A aba que voltou do congelamento não tem como saber o que perdeu, e o
   * servidor não tem como saber que ela congelou. Perguntar é a única saída, e
   * ela não pode custar nada a quem não perguntou.
   */
  it("reescreve a mesa de quem pediu, e só dele", async () => {
    const { clients } = await seated(3);

    const asked = clients[0].waitForMessage("hand", 1000);
    const quiet = clients[1].waitForMessage("hand", 400);
    clients[0].send("resync");

    await expect(asked).resolves.toBeDefined();
    await expect(quiet).rejects.toBeDefined();
  });
});

/*
 * O centro e o log não são reescritos a cada jogada: entra o que entrou e sai o
 * que saiu da janela. É mais barato e é mais frágil — um passo errado desalinha
 * as duas listas e nada avisa, porque a mesa continua desenhando com convicção
 * o que recebeu. Estes testes conferem contra a verdade do servidor.
 */
describe("o espelho do centro e do log", () => {
  const ids = (cards: { id: string }[]) => cards.map((card) => card.id);

  it("acompanha jogada a jogada, e pela revanche", async () => {
    const { room, clients } = await seated(3);
    const { game, sync } = engine(room);
    const seen = clients[0];

    const mirrors = async () => {
      sync();
      await room.waitForNextPatch();
      // A janela do centro é do tamanho da mesa cheia: uma vaza tem uma carta
      // de cada um, e nenhuma delas pode ficar de fora na hora de conferir.
      expect(ids([...seen.state.centre])).toEqual(ids(game.centre.slice(-MAX_PLAYERS)));
      expect([...seen.state.log]).toEqual(game.log);
    };

    game.start();
    await mirrors();

    // Vinte cartas passando pela janela: o suficiente para ela deslizar
    // várias vezes, e para o log de doze linhas dar a volta.
    for (let i = 0; i < 20; i++) {
      game.trick.push({ playerId: game.players[0].id, card: game.deck.pop()! });
      (game as unknown as { pushLog: (m: string) => void }).pushLog(`linha ${i}`);
      await mirrors();
    }

    // A revanche: centro vazio, log zerado, e nada da partida anterior sobrando.
    game.stage = "game_over";
    game.start();
    await mirrors();
  });
});

/*
 * A mão só vai para quem tem mão nova. Antes ela ia para todo mundo a cada
 * ação da mesa: uma jogada reescrevia os dez leques, carta por carta na rede,
 * para dizer aos nove que nada tinha mudado no deles.
 */
describe("a mão privada", () => {
  it("cala numa sincronização que não mexeu em mão nenhuma", async () => {
    const { room, clients, sync } = await dealt(3);

    const quiet = clients.map((c) => c.waitForMessage("hand", 400));
    sync();
    await room.waitForNextPatch();

    for (const wait of quiet) await expect(wait).rejects.toBeDefined();
  });

  it("fala com quem acabou de mexer na dele", async () => {
    const { clients, game, sync } = await playing(3);
    const turn = clients.find((c) => c.sessionId === game.currentPlayer!.id)!;

    const told = turn.waitForMessage("hand", 1000);
    game.playCard(turn.sessionId, game.playableCards(turn.sessionId)[0].id);
    sync();

    await expect(told).resolves.toBeDefined();
  });

  it("responde a um resync mesmo sem nada ter mudado", async () => {
    const { clients } = await dealt(3);

    const asked = clients[1].waitForMessage("hand", 1000);
    clients[1].send("resync");

    await expect(asked).resolves.toBeDefined();
  });
});

/*
 * A volta de quem caiu. O token de reconexão do Colyseus é uma chave que TROCA
 * a cada reconexão, e quem a perde — aba congelada, aba morta pelo sistema,
 * recarregar logo depois de reconectar — ficava trancado do lado de fora com a
 * própria cadeira guardada do outro lado da porta.
 *
 * A chave que resolve isso é a do jogador, não a da conexão: ela nasce no
 * navegador dele, não muda nunca, e vale enquanto a cadeira estiver guardada.
 */
/*
 * O buraco que trancava o jogador do lado de fora da própria mesa.
 *
 * O Colyseus não manda toda queda para o `onDrop`: quem cai LOGO DEPOIS de
 * reconectar (estado RECONNECTING), e quem fecha a página, chegam pelo
 * `onLeave` — o mesmo caminho de quem apertou "sair". Tratar os dois como saída
 * matava a cadeira em segundos, e não nos 90s prometidos: a pessoa minimizava o
 * navegador, voltava, e a mesa já não a conhecia.
 */
describe("uma queda que chega pelo caminho da saída", () => {
  it("guarda a cadeira em vez de matá-la", async () => {
    const { room } = await dealt(2);
    const bruno = room.clients[1];

    // Exatamente o que o framework faz quando o socket morre sem consentimento.
    await (room as unknown as { onLeave: (c: unknown, code: number) => Promise<void> })
      .onLeave(bruno, 1001);

    expect([...room.state.players].map((p) => p.name)).toEqual(["P0", "P1"]);
    expect(room.state.players[1].connected).toBe(false);
    expect(room.state.phase).toBe("playing");
  });

  it("tira a cadeira de quem saiu de propósito", async () => {
    const { room } = await dealt(3);
    const saindo = room.clients[2];

    // 4000 = CONSENTED: o botão "voltar ao início", e não uma queda.
    await (room as unknown as { onLeave: (c: unknown, code: number) => Promise<void> })
      .onLeave(saindo, 4000);

    expect([...room.state.players].map((p) => p.name)).toEqual(["P0", "P1"]);
  });
});

describe("a volta de quem caiu", () => {
  /** Derruba o socket sem consentimento, que é o que uma queda de verdade faz. */
  async function drop(client: { connection: { transport: { ws: { close: () => void } } } }) {
    client.connection.transport.ws.close();
    await new Promise((done) => setTimeout(done, 600));
  }

  it("devolve a cadeira e a mão a quem volta com a chave, sem o token", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", { roomName: "Mesa" });
    const ana = await colyseus.connectTo(room, { playerName: "Ana", seatKey: "chave-ana" });
    const bruno = await colyseus.connectTo(room, { playerName: "Bruno", seatKey: "chave-bruno" });
    const { game, sync } = engine(room);
    game.start();
    sync();
    await Promise.all([ana, bruno].map((c) => c.waitForMessage("hand", 1000)));
    const antes = game.players.find((p) => p.name === "Bruno")!.hand.map((c) => c.id);

    await drop(bruno);
    expect(room.state.players.length).toBe(2);

    // A aba nova: sem token nenhum, só a chave que o navegador guardou.
    const devolta = await colyseus.connectTo(room, { playerName: "Bruno", seatKey: "chave-bruno" });
    const mao = await devolta.waitForMessage("hand", 1000);

    expect(room.state.players.length).toBe(2);
    expect([...room.state.players].map((p) => p.name)).toEqual(["Ana", "Bruno"]);
    // Rodada 1: a carta é dele e ele não a vê — o que volta é o id escondido.
    expect(mao.hiddenIds).toEqual(antes);
    expect(room.state.players.find((p) => p.name === "Bruno")!.connected).toBe(true);
  });

  it("não deixa um estranho sentar no meio da partida", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", { roomName: "Mesa" });
    await colyseus.connectTo(room, { playerName: "Ana", seatKey: "chave-ana" });
    await colyseus.connectTo(room, { playerName: "Bruno", seatKey: "chave-bruno" });
    const { game, sync } = engine(room);
    game.start();
    sync();

    await expect(
      colyseus.connectTo(room, { playerName: "Estranho", seatKey: "chave-estranho" }),
    ).rejects.toThrow(/já começou/);
    expect(room.state.players.length).toBe(2);
  });

  it("recusa a chave de quem continua sentado: cadeira não se rouba", async () => {
    const room = await colyseus.createRoom<TableRoom>("table", { roomName: "Mesa" });
    await colyseus.connectTo(room, { playerName: "Ana", seatKey: "chave-ana" });
    await colyseus.connectTo(room, { playerName: "Bruno", seatKey: "chave-bruno" });
    const { game, sync } = engine(room);
    game.start();
    sync();

    // Bruno não caiu: a chave dele não abre nada.
    await expect(
      colyseus.connectTo(room, { playerName: "Ladrão", seatKey: "chave-bruno" }),
    ).rejects.toThrow(/em outra aba/);
    expect(room.state.players.length).toBe(2);
  });
});

/*
 * O emoji é instante, e não situação: sai para todo mundo por mensagem e não
 * encosta no estado sincronizado. Se um dia ele entrar no schema, este teste
 * cai — e é para cair, porque aí ele ressuscitaria na tela de quem entrasse
 * depois, comentando uma jogada que já passou.
 */
describe("a conversa da mesa", () => {
  it("chega a todos, inclusive a quem falou, e fica fora do estado", async () => {
    const { room, clients } = await seated(3);

    const heard = clients.map((c) => c.waitForMessage("emote", 1000));
    clients[0].send("emote", { emote: "😂" });

    for (const wait of heard) {
      await expect(wait).resolves.toMatchObject({ by: clients[0].sessionId, emote: "😂" });
    }
    expect(JSON.stringify(room.state)).not.toContain("😂");
  });

  it("engole em silêncio o emoji que veio rápido demais", async () => {
    const { clients } = await seated(3);

    await clients[0].waitForMessage("emote", 1000).catch(() => undefined);
    clients[0].send("emote", { emote: "😂" });
    await clients[0].waitForMessage("emote", 1000);

    const tooSoon = clients[0].waitForMessage("emote", 400);
    clients[0].send("emote", { emote: "👏" });
    await expect(tooSoon).rejects.toBeDefined();
  });
});
