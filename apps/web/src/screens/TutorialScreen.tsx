import { useEffect, useState, type ReactNode } from "react";
import { HIERARCHY, SUIT_LADDER, SUIT_NAME, STARTING_POINTS, cardLabel } from "@fdp/shared";
import { artUrl, backUrl } from "../lib/cards";
import { navigate } from "../lib/router";
import { useUi } from "../store/ui";
import { YourPoints } from "../components/YourPoints";

/**
 * Aprenda a jogar.
 *
 * Sete etapas, uma ideia por etapa, e nenhuma delas depende da seguinte para
 * fazer sentido. A ordem não é a do documento das regras: é a ordem em que a
 * dúvida aparece na cabeça de quem nunca jogou — para que serve isto, quanto
 * vale cada carta, o que é prometer, por que aquele número está recusado, como se
 * ganha uma vaza, por que ganhar pode ser ruim, e o que é ser o FDP.
 *
 * O texto vem de exemplos, e não de definições. O que trava um jogo de
 * promessas para quem chega não é a regra: é não acreditar nela.
 */

type Step = { title: string; body: ReactNode };

const STEPS: Step[] = [
  {
    title: "1 · O objetivo",
    body: (
      <>
        <p>
          Você começa com <b>{STARTING_POINTS} pontos</b> — quem abre a mesa
          pode combinar outro número. Eles nunca sobem — só descem. Seu objetivo é ser <b>o último jogador ainda com pontos</b>.
        </p>
        <Points />
        <p>
          Perder ponto não quer dizer que você jogou mal: quase toda rodada
          alguém perde. Quer dizer que você está mais perto da porta. Quando
          chega a <b>zero</b>, você sai da mesa.
        </p>
      </>
    ),
  },
  {
    title: "2 · As cartas",
    body: (
      <>
        <p>
          O baralho é o francês inteiro mais <b>um</b> coringa — 53 cartas. A
          força delas não é a de sempre: vai da mais fraca para a mais forte
          assim:
        </p>
        <Hierarchy />
        <p>
          As cinco marcadas são as <b>especiais</b>. Repare no truque: os quatros
          comuns são as cartas <b>mais fracas</b> do baralho, mas o{" "}
          <b>4 de paus é a mais forte de todas</b>. O mesmo vale para o 7 de
          ouros e o 7 de copas, que passam por cima dos outros sietes, e para o
          ás de espadas, que passa por cima dos outros ases.
        </p>
        <p>
          Não há naipe a seguir e não há trunfo. E duas cartas do mesmo valor
          não valem o mesmo: o <b>naipe desempata</b>, nesta ordem.
        </p>
        <SuitLadder />
        <p className="px-label">
          Um 5 de paus ganha de um 5 de copas — e perde para qualquer 6.
        </p>

        <p>
          Até aqui é o jogo base. Quem abre a mesa pode ligar mais{" "}
          <b>duas regras</b>, e as duas mexem justamente nisto — no que a carta
          vale. Elas aparecem no alto da tela quando estão valendo; se você não
          vê o nome delas lá, a mesa é a do jogo base.
        </p>

        <div className="fdp-demo flex flex-col gap-2">
          <p style={{ color: "var(--mark)" }}>
            <b>Cangar</b> — cartas de valor igual <b>se anulam</b>.
          </p>
          <p>
            Se dois jogadores baixam um valete, os dois valetes somem da disputa
            e a mão vai para a carta mais forte que <b>sobrou</b> — mesmo que
            ela seja fraquíssima. Aqui o naipe não desempata nada: um valete
            some junto com o outro.
          </p>
          <Cangar />
          <p>
            Se <b>tudo</b> se anular — J, J, J e 2, 2, por exemplo — a mão não é
            de ninguém, não conta para promessa nenhuma, e quem saiu nela sai de
            novo na seguinte.
          </p>
          <p className="px-label">As manilhas não se anulam: cada uma é única.</p>
        </div>

        <div className="fdp-demo flex flex-col gap-2">
          <p style={{ color: "var(--mark)" }}>
            <b>Porcão</b> — o 4♠ mata o 4♣.
          </p>
          <Porcao />
          <p>
            Com o 4♣ na mesa, o 4♠ vira a carta mais forte e leva a mão.{" "}
            <b>Sem</b> o 4♣ na mesa, ele é a carta <b>mais fraca do baralho</b> —
            abaixo até do 4 de ouros.
          </p>
          <p className="px-label">
            É a carta que só serve para uma coisa, e essa coisa é acabar com a
            noite de quem estava contando com o zap.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "3 · A promessa",
    body: (
      <>
        <p>
          Cada rodada começa com um reparto — 1 carta na primeira, 2 na segunda,
          3 na terceira, e assim por diante. Antes de jogar, cada um diz{" "}
          <b>quantas mãos acha que vai ganhar</b>. Isso é a promessa.
        </p>
        <Bubble>“Acho que ganho 2.” → sua promessa é 2.</Bubble>
        <p>
          Dá para prometer de <b>0</b> até <b>o número de cartas que você recebeu</b>.
          Prometer zero é uma jogada legítima, e às vezes a melhor: significa que
          você vai passar a rodada inteira tentando <b>não</b> ganhar nada.
        </p>
      </>
    ),
  },
  {
    title: "4 · A regra do último",
    body: (
      <>
        <p>
          Quem reparte declara por último — e ele tem uma proibição:{" "}
          <b>a soma das promessas não pode ser igual ao número de cartas</b>.
        </p>
        <Example />
        <p>
          Se o jogador 4 dissesse 1, a soma daria 2+1+1+1 = <b>5</b>, que é
          exatamente o número de cartas. Então <b>1 está fora</b> para ele: ele
          pode escolher 0, 2, 3, 4 ou 5.
        </p>
        <p>
          Por que existe: se a soma pudesse fechar, <b>todo mundo</b> poderia
          cumprir a promessa ao mesmo tempo, e ninguém perderia ponto nenhum. A
          regra garante que <b>alguém</b> vai errar.
        </p>
        <p className="px-label">
          Na mesa você escolhe no − e no +. O número impossível fica em vermelho
          e a mesa avisa por que — às vezes sobra um só, e aí não há escolha
          nenhuma.
        </p>
      </>
    ),
  },
  {
    title: "5 · As rodadas de uma carta são às cegas",
    body: (
      <>
        <p>
          Quando a rodada é de <b>uma carta só</b> — a primeira da partida, e
          cada vez que o ciclo recomeça —, você <b>não pode ver a sua</b>. Você vê
          a de todo mundo, menos a sua.
        </p>
        <Blind />
        <p>
          Você aposta olhando os outros: se todos à sua volta estão com cartas
          fracas, a sua provavelmente ganha. A regra do último continua valendo —
          e com uma carta ela quase sempre morde.
        </p>
      </>
    ),
  },
  {
    title: "6 · Jogando as mãos",
    body: (
      <>
        <p>
          Todo mundo baixa uma carta. <b>Não existe passar</b> e{" "}
          <b>não existe comprar</b>: quem tem carta, joga. Quem baixou a carta
          mais forte <b>leva a mão</b> — e é ele quem começa a próxima.
        </p>
        <Trick />
        <p>
          A rodada acaba quando as cartas acabam. Com 5 cartas cada, são 5
          mãos, e as 5 vão para alguém.
        </p>
      </>
    ),
  },
  {
    title: "7 · Cumpra a promessa",
    body: (
      <>
        <p>
          No fim da rodada, compare o que você prometeu com o que você fez. A
          diferença, em módulo, é o que você <b>perde</b>.
        </p>
        <Scoring />
        <p>
          Repare na linha do meio: prometer 3 e fazer <b>5</b> dói tanto quanto
          prometer 3 e fazer <b>1</b>. Ganhar mão a mais é tão ruim quanto
          ganhar mão a menos.
        </p>
      </>
    ),
  },
  {
    title: "8 · Seja o FDP",
    body: (
      <>
        <p>No FDP, ganhar nem sempre é bom.</p>
        <p>Às vezes você precisa ganhar uma mão.</p>
        <p>Às vezes precisa fugir dela.</p>
        <p>
          E, principalmente, precisa fazer os <b>outros</b> errarem as promessas
          deles — segurando o 4 de paus para roubar a mão que faltava a alguém, ou
          entregando uma mão para quem já cumpriu a dele.
        </p>
        <p className="px-title" style={{ color: "var(--mark)" }}>
          Você não precisa ser o melhor jogador. Precisa ser o FDP que sobrevive
          por último.
        </p>
      </>
    ),
  },
];

export function TutorialScreen() {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  // Setas do teclado: quem está lendo não quer tirar a mão para clicar.
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setStep((n) => Math.min(STEPS.length - 1, n + 1));
      if (event.key === "ArrowLeft") setStep((n) => Math.max(0, n - 1));
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="px-title">Aprenda a jogar</h1>
        <button type="button" className="px-link" onClick={() => navigate("/")}>
          voltar ao início
        </button>
      </header>

      {/*
        A régua de etapas: quadradinhos, e não uma barra que enche. O leitor
        precisa saber quantas faltam E poder pular para uma que já leu — quem
        volta ao tutorial volta por causa de uma regra específica, quase sempre
        a do último a declarar.
      */}
      <nav className="flex flex-wrap gap-1" aria-label="Etapas">
        {STEPS.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={`fdp-step ${index === step ? "is-here" : ""} ${index < step ? "is-done" : ""}`}
            aria-label={item.title}
            aria-current={index === step}
            onClick={() => setStep(index)}
          />
        ))}
      </nav>

      <article className="px-slab flex flex-1 flex-col gap-3 p-5">
        <h2 className="px-title" style={{ fontSize: 14 }}>
          {current.title}
        </h2>
        <div className="fdp-prose flex flex-col gap-3 text-sm">{current.body}</div>
      </article>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="px-btn"
          onClick={() => setStep((n) => Math.max(0, n - 1))}
          disabled={step === 0}
        >
          ◂ Voltar
        </button>
        <span className="px-label">
          {step + 1} de {STEPS.length}
        </span>
        {last ? (
          <button type="button" className="px-btn px-btn-primary" onClick={() => navigate("/")}>
            Abrir uma mesa
          </button>
        ) : (
          <button
            type="button"
            className="px-btn px-btn-primary"
            onClick={() => setStep((n) => n + 1)}
          >
            Seguir ▸
          </button>
        )}
      </div>
    </main>
  );
}

/* ---------------------------------------------------------- as ilustrações */

/** Dez quadradinhos: os pontos de todo mundo no começo da partida — a mesma
    fileira que fica ao lado do log durante a partida. */
function Points() {
  return <YourPoints points={STARTING_POINTS} />;
}

/** A escada inteira, com as cinco especiais marcadas. */
function Hierarchy() {
  return (
    <ol className="fdp-ladder">
      {HIERARCHY.map((step) => (
        <li key={step.label} className={step.special ? "is-special" : ""}>
          <img src={artUrl(step.card)} alt={cardLabel(step.card)} />
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Os quatro naipes, do mais fraco para o mais forte, num valor só. */
function SuitLadder() {
  return (
    <ol className="fdp-ladder">
      {SUIT_LADDER.map((suit) => (
        <li key={suit}>
          <img src={artUrl({ suit, rank: "5" })} alt={cardLabel({ suit, rank: "5" })} />
          <span>{SUIT_NAME[suit]}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * O cangar em uma linha: dois valetes se anulam e a vaza vai para o 5, que é a
 * carta mais fraca da mesa. O exemplo precisa ser absurdo para a regra colar —
 * "a mais forte que sobrou" só assusta quando se vê um 5 ganhando de um valete.
 */
function Cangar() {
  const played = [
    { card: { suit: "spades", rank: "j" } as const, state: "anulada" },
    { card: { suit: "hearts", rank: "j" } as const, state: "anulada" },
    { card: { suit: "diamonds", rank: "5" } as const, state: "leva" },
  ];
  return (
    <div className="flex flex-wrap items-end gap-3">
      {played.map((play) => (
        <figure key={cardLabel(play.card)} className="flex flex-col items-center gap-1">
          <img
            className={`fdp-demo-card ${play.state === "leva" ? "is-won" : "is-void"}`}
            style={{ width: "calc(var(--fdp-card-w) * 0.45)" }}
            src={artUrl(play.card)}
            alt={cardLabel(play.card)}
          />
          <figcaption
            className="px-label"
            style={play.state === "leva" ? { color: "var(--mark)" } : undefined}
          >
            {play.state === "leva" ? "leva a mão" : "anulada"}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** O porcão nas duas situações: com o zap na mesa e sem ele. */
function Porcao() {
  const rows = [
    {
      cards: [
        { suit: "spades", rank: "4" },
        { suit: "clubs", rank: "4" },
        { suit: "hearts", rank: "7" },
      ],
      winner: 0,
      note: "com o 4♣ na mesa, o 4♠ leva",
    },
    {
      cards: [
        { suit: "spades", rank: "4" },
        { suit: "diamonds", rank: "4" },
      ],
      winner: 1,
      note: "sem o 4♣, o 4♠ é a mais fraca",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.note} className="flex flex-wrap items-center gap-2">
          {row.cards.map((card, index) => (
            <img
              key={cardLabel(card)}
              className={`fdp-demo-card ${index === row.winner ? "is-won" : ""}`}
              style={{ width: "calc(var(--fdp-card-w) * 0.45)" }}
              src={artUrl(card)}
              alt={cardLabel(card)}
            />
          ))}
          <span className="px-label" style={{ textTransform: "none" }}>
            {row.note}
          </span>
        </div>
      ))}
    </div>
  );
}

/** O exemplo do documento, com o número proibido riscado. */
function Example() {
  const bids = [
    ["Jogador 1", "2"],
    ["Jogador 2", "1"],
    ["Jogador 3", "1"],
  ];
  return (
    <div className="fdp-demo flex flex-col gap-2">
      <p className="px-label">5 cartas por jogador</p>
      <ul className="flex flex-col gap-1">
        {bids.map(([who, what]) => (
          <li key={who} className="flex justify-between">
            <span>{who}</span>
            <b style={{ color: "var(--paper-hi)" }}>{what}</b>
          </li>
        ))}
        <li className="flex justify-between" style={{ color: "var(--mark)" }}>
          <span>Jogador 4</span>
          <span>?</span>
        </li>
      </ul>
      <p className="px-label">A promessa dele</p>
      <p className="flex flex-wrap gap-1">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`fdp-key ${n === 1 ? "is-blocked" : ""}`}>
            {n}
          </span>
        ))}
      </p>
    </div>
  );
}

/** A sua carta virada, e as dos outros abertas. */
function Blind() {
  const back = useUi((ui) => ui.back);
  const others = [
    { name: "Jogador 2", card: { suit: "clubs", rank: "4" } as const },
    { name: "Jogador 3", card: { suit: "hearts", rank: "7" } as const },
  ];
  return (
    <div className="fdp-demo flex flex-wrap items-end justify-center gap-5">
      <figure className="flex flex-col items-center gap-1">
        <img className="fdp-demo-card" src={backUrl(back)} alt="sua carta, escondida" />
        <figcaption className="px-label" style={{ color: "var(--mark)" }}>
          sua carta
        </figcaption>
      </figure>
      {others.map((other) => (
        <figure key={other.name} className="flex flex-col items-center gap-1">
          <img className="fdp-demo-card" src={artUrl(other.card)} alt={cardLabel(other.card)} />
          <figcaption className="px-label">{other.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Três cartas na mesa e quem levou. */
function Trick() {
  const played = [
    { name: "Jogador 1", card: { suit: "spades", rank: "k" } as const, won: false },
    { name: "Jogador 2", card: { suit: "diamonds", rank: "7" } as const, won: false },
    { name: "Jogador 3", card: { suit: "clubs", rank: "4" } as const, won: true },
  ];
  return (
    <div className="fdp-demo flex flex-wrap items-end justify-center gap-4">
      {played.map((play) => (
        <figure key={play.name} className="flex flex-col items-center gap-1">
          <img
            className={`fdp-demo-card ${play.won ? "is-won" : ""}`}
            src={artUrl(play.card)}
            alt={cardLabel(play.card)}
          />
          <figcaption className="px-label" style={play.won ? { color: "var(--mark)" } : undefined}>
            {play.won ? "levou a mão" : play.name}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** A tabelinha da diferença absoluta. */
function Scoring() {
  const rows = [
    [3, 3, 0],
    [3, 5, 2],
    [3, 1, 2],
    [3, 2, 1],
    [3, 0, 3],
  ];
  return (
    <table className="fdp-score-table fdp-demo text-sm">
      <thead>
        <tr className="px-label">
          <th>prometeu</th>
          <th>fez</th>
          <th>perde</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([promise, tricks, lost]) => (
          <tr key={`${promise}-${tricks}`}>
            <td>{promise}</td>
            <td>{tricks}</td>
            <td style={{ color: lost === 0 ? "var(--live)" : "var(--ink-red)" }}>
              {lost === 0 ? "nada" : `-${lost}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bubble({ children }: { children: ReactNode }) {
  return (
    <p className="fdp-demo text-center" style={{ color: "var(--paper-hi)" }}>
      {children}
    </p>
  );
}
