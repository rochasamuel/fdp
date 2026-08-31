# FDP

Jogo de cartas multiplayer, com baralho francês. O servidor é autoritativo: o
cliente apenas pede ações e desenha o estado que recebe de volta.

**FDP é um jogo de promessas.** Você começa com 10 pontos, e eles só descem.
Antes de cada rodada você diz quantas mãos vai fazer; no fim, perde a diferença
entre o que prometeu e o que fez. Chegou a zero, saiu. Ganha quem sobrar.

Uma **mão** é uma volta em que todos baixam uma carta — é como a mesa chama, e é
o que a tela escreve. No código ela é `trick`; `hand` é o outro sentido da
palavra, o punhado de cartas que cada um recebeu.

As regras completas estão em [`docs/REGRAS.md`](docs/REGRAS.md) — é a fonte
única da verdade, e o jogo dentro de `apps/server/src/game/` a implementa. Quem
nunca jogou tem o tutorial em `/aprender`, dentro do próprio app.

## Arquitetura

```
React (apps/web)
   │  @colyseus/sdk
   ▼
Colyseus (apps/server)
   │
   ├── TableRoom    sala, conexões, reconexão, estado sincronizado, relógio
   │
   └── TableGame    A REGRA: rodadas, promessas, mãos, pontos, eliminação
```

O estado oficial da partida vive **em memória no servidor**. Não há banco de
dados: reiniciar o processo perde as mesas em andamento, e isso é aceitável.
`TableGame` não conhece Colyseus, então trocar o transporte ou persistir o
estado depois não obriga a reescrevê-lo. Ele também é **determinístico**: o
único acaso é a função `random` do construtor, e as duas pausas que a partida
tem — a mão fechada descansando na mesa, o placar da rodada na tela — não são
timers dele. O motor diz o que está *pendente* e por quanto tempo (`pending`), e
quem conta o tempo é a sala, que é quem tem relógio. É isso que deixa o teste
rodar uma partida inteira sem esperar um milissegundo.

### O que o cliente recebe

`TableRoomState` carrega só informação pública: jogadores, pontos, promessas,
mãos feitas, jogador da vez, etapa da partida, a mão em disputa e as mensagens
de sistema. **As cartas de um jogador nunca entram no estado sincronizado** — ela vai numa mensagem `hand` endereçada só ao dono,
junto da lista de cartas que ele pode jogar agora e das promessas que ele pode
declarar. Quem decide o que é jogável e o que é declarável é o servidor; a UI
apenas obedece.

A promessa de cada um, ao contrário da mão, **é pública desde que sai da boca**:
o jogo é justamente sobre atrapalhar a promessa dos outros, e escondê-la
tiraria dele a única informação que o torna um jogo.

Nas **rodadas às cegas** — toda rodada de uma carta — a limitação é de verdade
e não um verso desenhado por cima: a mensagem `hand` do dono vem com `cards: []` e
`hiddenIds: [id]`. O naipe e o valor da carta dele **não saem do servidor** até
ela cair na mesa. As mãos dos adversários, essas sim, vêm abertas em `peek`.

Fora do estado sincronizado ficam também os **instantes**: os eventos `fx`, que
as animações usam, e a conversa da mesa (`emote`), um emoji de uma lista fechada
que aparece por três segundos abaixo de quem falou. Nenhum dos dois é situação —
guardá-los no estado os faria ressuscitar na tela de quem entrasse depois.

## Requisitos

- Node.js >= 20.9
- pnpm (`corepack enable pnpm`)

## Instalação

```bash
pnpm install
```

## Desenvolvimento

```bash
pnpm dev          # tipos compartilhados + servidor (8080) + web (5173)
pnpm dev:web
pnpm dev:server
```

Abra <http://localhost:5173>.

## Build e testes

```bash
pnpm build        # valida o projeto inteiro
pnpm build:web
pnpm build:server
pnpm test         # a regra (motor) e a sala (transporte)
pnpm lint
```

Em produção o servidor roda com `pnpm --filter server start` (a partir de
`apps/server/build`). O endpoint usado pelo front sai de `VITE_SERVER_URL`, com
`http://<host>:8080` como padrão.

`@fdp/shared` é compilado (os apps importam `dist/`, não `src/`), e `dist/` não
vai para o git. Por isso o `build` de cada app compila o pacote compartilhado
antes de compilar a si mesmo: num container recém-clonado, `pnpm --filter server
build` sozinho não teria os tipos e falharia com `Cannot find module
'@fdp/shared'`. Compilar duas vezes custa um segundo; descobrir isso no deploy
custa mais.

## Estrutura

```
apps/
  server/
    src/game/       TableGame (a regra), deck
    src/rooms/      TableRoom, TableState
  web/
    public/cards/   as 62 artes SVG do baralho
    src/components/ mesa, mão, pilhas, assentos
    src/screens/    home, sala, tutorial (/aprender), mock
    src/game/       conexão com a sala, voos das cartas
packages/
  shared/           tipos de carta, a hierarquia, as contas da promessa e o
                    formato do estado público
docs/
  REGRAS.md         a fonte única da verdade sobre a regra
tools/
  cards/            gerador dos SVGs (Python)
```

Para regerar as artes:

```bash
FDP_CARDS_OUT=apps/web/public/cards python3 tools/cards/gen_card.py
```

## A regra

Tudo em `apps/server/src/game/TableGame.ts`, e nada em lugar nenhum além dele.
A ordem de uma rodada é a máquina de estados de `MatchStage`:

```
waiting_for_players → dealing → making_promises → playing_trick
                                                       ↕
                                       round_result → player_elimination → …
                                                                       → game_over
```

O que ela garante, e que a tela não precisa repetir:

- **O ciclo das mãos.** 1 carta, 2, 3… até o máximo que dá para dividir
  igualmente pelo baralho de 53 (o francês mais **um** coringa), e daí volta
  para 1. O máximo é recalculado a cada rodada, porque ele depende de quantos
  ainda jogam. Toda rodada de 1 carta é **às cegas**.
- **O dealer.** Passa para o próximo no sentido horário a cada rodada. O
  jogador à direita dele abre as promessas — e o dealer, por isso, declara por
  último.
- **A regra do último.** A soma das promessas nunca pode dar o número de
  cartas da mão. Como o último fecha a soma, é ele quem carrega a proibição —
  às vezes uma escolha a menos, às vezes uma escolha só. A conta mora em
  `forbiddenPromise` no `@fdp/shared`, porque a tela precisa dela para apagar o
  botão; quem RECUSA continua sendo o servidor.
- **A hierarquia.** `4 < 5 < … < 3 < Joker < 7♦ < A♠ < 7♥ < 4♣`, numa tabela
  explícita em `@fdp/shared`. Cinco cartas fogem do próprio valor — o 4♣ é a
  mais forte do baralho enquanto os outros quatros são as mais fracas —, e
  força derivada do valor numérico é exatamente onde esse tipo de exceção vira
  bug silencioso. O naipe desempata (`♦ < ♠ < ♥ < ♣`), o que faz dela uma ordem
  **total**: nenhuma mão empata.
- **As regras da casa.** Duas, opcionais, escolhidas na criação da mesa e fixas
  até o fim. **Cangar**: cartas de valor igual se anulam, e a mão em que tudo
  se anula não é de ninguém — quem saiu nela sai de novo. **Porcão**: o 4♠ mata
  o 4♣ e exclusivamente ele; sem o zap na mesa, ele é a carta mais fraca do
  baralho. As duas moram em `trickWinner` e nas três funções curtas ao lado
  dele (`survivors`, `strength`, `immune`) — o resto do motor não sabe que elas
  existem.
- **A pontuação.** `|promessa − mãos|`, nunca abaixo de zero, e só desce.
  Chegou a zero, o jogador é eliminado; sobrou um, a partida acabou. Se a mesa
  inteira zerar de uma vez, vence quem chegou mais perto do zero — o cálculo sem
  o piso é o que separa quem parou exato em 0 de quem parou dois abaixo, e é ele
  que a tela mostra no fim. Mesmo saldo é empate: `winnerIds` carrega os dois.

Não existe passar e não existe comprar: as duas mensagens que existiam para
isso saíram do `TableRoom`. Uma mensagem que o servidor aceita é uma regra que o
jogo tem.

Campo novo que a tela precise ver: `apps/server/src/rooms/TableState.ts` e o
tipo `TableState` em `packages/shared`, que descreve o mesmo formato. Os dois,
sempre — um sem o outro é um campo que o servidor manda e ninguém lê.

## Design

A interface é pixel art porque as cartas são. Os tokens em `src/index.css` não
são escolhidos a olho: são as rampas de cor de `tools/cards/gen_card.py`. O
texto usa o material da **moldura** da carta (`FRM`), a única cor de ênfase é o
**rosa da trama do verso** (`#c4869e`), e os painéis são esse mesmo rosa levado
ao escuro — o verso é claro, e um painel claro atrás de uma carta clara apagaria
a carta.

Quatro regras, todas herdadas do desenho das cartas:

- nada de blur, de `border-radius` ou de gradiente suave;
- tudo na grade de 4px, com traço de 2px (o chanfro da carta é 4px, o traço 2px);
- relevo de três partes — claro em cima/à esquerda, escuro embaixo/à direita —
  que é a mesma estrutura que dá volume aos índices das cartas;
- sombra dura deslocada, nunca difusa; botão apertado afunda exatamente a
  altura da própria sombra.

O movimento segue a mesma divisão: as **cartas** se movem como objetos físicos;
a **interface** pisca em quadros (`steps()`), como um jogo de 32 bits.

### O pano da mesa

Cinco panos — verde, vinho, marinho, grafite e nogueira —, todos do mesmo valor
de cinza, para que a carta, o texto creme e o rosa da ênfase leiam igual sobre
qualquer um. A escolha é **de quem olha, não da sala**: mora no `localStorage`
junto do som e da mesa redonda, e chega ao CSS como um `data-felt` no `<html>`.
Ninguém troca o pano da mesa dos outros.

Um pano novo é uma linha em `lib/felt.ts` e uma variável `--felt-*` no
`index.css`.

### O verso

São oito (`weave`, `zigzag`, `argyle`, `bloom`, `ripple`, `maze`, `basket`,
`planet`) e todos usam a mesma paleta. Qual deles o jogo usa é a constante
`BACK_URL` em `src/lib/cards.ts`.

### Mesa de mentira para acertar o layout

`/mock` monta a mesma `Table` com estado inventado e um painel de controles:
número de cartas do reparto (1–30), de jogadores (2–10), etapa da partida
(promessas, mão, placar), rodada às cegas, fim de partida, reparto e sorteio.
Serve para ver os extremos sem subir servidor nem juntar gente. Não toca em
nada do jogo — é só outra rota.

### A mão nunca passa da janela

O leque cabe por dois meios, nesta ordem: as cartas se sobrepõem mais (até 84%,
limite em que ainda sobra faixa para clicar) e, só quando isso se esgota,
encolhem. A abertura do leque também trava em 36° no total, senão as cartas das
pontas giram para fora da tela.

## Como usar

1. Na home, informe o nome da mesa e o seu nome e crie a mesa. Ali também se
   escolhe o teto de cartas por rodada e as regras da casa — as três coisas
   ficam fixas até o fim da partida, e o painel `⚙ regras` do cabeçalho as
   mostra para quem entrou depois.
2. Copie o link (`/room/CÓDIGO`) e mande para os outros.
3. Quem abrir o link informa um nome e entra. Não há login.
4. Com 2 jogadores ou mais, o host começa — uma roleta sorteia quem sai.
5. A rodada 1 é **às cegas**: uma carta para cada um, e você vê a de todos
   menos a sua. Declare quantas mãos vai fazer.
6. Depois das promessas, clique numa carta para selecioná-la e clique de novo
   para jogar, ou arraste-a até o centro. Quem baixar a mais forte leva a mão
   e começa a próxima.
7. No fim da rodada, quem errou a promessa perde a diferença. A cada rodada uma
   carta a mais no reparto, até o baralho não dar mais — e aí volta para uma.

Quem nunca jogou: **/aprender**, oito etapas, com as cartas na tela.

### Quem cai volta

A regra é uma frase: **a cadeira fica guardada por 90 segundos, e só então
morre** (`RECONNECT_TIMEOUT`; no lobby são 5 minutos, `LOBBY_RECONNECT_TIMEOUT`,
porque ali ninguém está esperando uma vez — o caso comum é o host sair do
navegador para mandar o link no WhatsApp). Dentro do prazo, a mão, o lugar na
roda e a vez continuam de pé.

Cumprir essa frase exigiu duas correções, e as duas valem para qualquer jogo que
nascer daqui:

**1. Nem toda queda chega pelo `onDrop`.** O Colyseus manda para o `onLeave` —
o mesmo caminho de quem apertou "voltar ao início" — quem cai logo depois de
reconectar (o cliente ainda em `RECONNECTING`) e quem fecha a página. Tratar
isso como saída matava a cadeira em segundos: a pessoa minimizava o navegador,
o socket morria duas vezes, e a mesa já não a conhecia quando ela voltava. Hoje
a pergunta não é por onde a notícia chegou, e sim se ela foi **consentida**: só
o código `4000` é uma saída de verdade, o resto é queda, e queda guarda lugar.
Quem tira a cadeira no fim é o `catch` do próprio `allowReconnection`, que é o
único que sabe que o prazo venceu.

**2. O token de reconexão não é uma chave estável.** O servidor o TROCA a cada
reconexão, e a aba que morre entre a troca e a gravação no `localStorage` volta
com uma chave morta na mão — a sala recusa, e antes não havia segunda porta.
Por isso cada jogador carrega também uma **`seatKey`**: sorteada no navegador na
primeira entrada, nunca muda, e é o que o `onJoin` reconhece para devolver a
cadeira a quem voltou sem o token. A cadeira só se reclama vazia — com o dono
conectado, a chave não abre nada.

É por causa da `seatKey` que a sala **não é trancada** durante a partida: uma
sala trancada recusa antes de olhar quem está batendo, e quem estava batendo era
justamente quem tinha uma cadeira lá dentro. Quem decide quem entra é o
`onJoin`, e ele recusa desconhecido com todas as letras.

### Som

Solte um `.mp3` em `apps/web/public/sounds/` com o nome do efeito (`draw`,
`play`, `turn`, `victory`, `bubble`) e o `useSound` passa a tocá-lo. Sem
arquivo, ele fica em silêncio.

## De onde isto veio

A mesa é a do [nuo](../nuo), um jogo de UNO multiplayer, sem nenhuma das regras
dele. O que veio junto foi o que qualquer jogo de baralho refaria igual: a sala,
a reconexão, o leque que sempre cabe, os voos das cartas, a conversa por emoji e
o sistema de design. O que ficou para trás foram as cartas de UNO, o baralho de
108, o seletor de coringa, o grito de UNO e as regras da casa.
# fdp
