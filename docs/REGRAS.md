# FDP — as regras

Este documento é a **fonte única da verdade** sobre a lógica do jogo. Onde a
implementação divergir dele, quem está errado é a implementação.

O motor que o implementa é `apps/server/src/game/TableGame.ts`, com as contas
puras (força da carta, ciclo dos repartos, promessa proibida, pontos perdidos)
em
`packages/shared/src/index.ts`.

**Uma palavra.** Cada volta em que todos baixam uma carta é uma **mão** — é
como a mesa chama e é o que a tela escreve. O conjunto de cartas que cada um
recebeu não é chamado de mão em lugar nenhum deste documento: é o **reparto**,
ou "as cartas dele". No código a mão é `trick` e o reparto é `hand`.

---

## 1. Objetivo

Cada jogador começa com **10 pontos**. Os pontos **nunca sobem**.

O objetivo não é acumular: é **perder o mínimo possível** e ser o último
jogador ainda com pontos. Quem chega a **0** é eliminado. Vence o último de pé.

## 2. Estrutura de uma rodada

1. distribuição das cartas
2. declaração das promessas
3. jogada das cartas (as mãos)
4. contagem das mãos
5. cálculo da pontuação
6. eliminação
7. rodada seguinte

## 3. Distribuição

O reparto começa com **1 carta** por jogador e sobe de uma em uma a cada
rodada.

Quando não couber mais uma cartada **igual para todos**, o ciclo volta para 1:

```
1 → 2 → 3 → … → máximo possível → 1 → 2 → 3 → …
```

O máximo é `floor(53 / jogadores)` — o baralho francês inteiro mais **um**
coringa. As cartas que não couberem na divisão **ficam fora** do reparto.

Com 5 jogadores, por exemplo, o máximo é 10; depois de uma rodada de 10, a
seguinte volta a ser de 1.

A mesa pode combinar um **teto** menor na criação — "máximo de cartas por
rodada". Ele encurta o ciclo e nunca o estica: chegou ao teto, a rodada seguinte
volta para 1, mesmo que o baralho ainda desse mais. Sem teto, quem manda é o
baralho.

## 4. Dealer

Um jogador reparte. Depois de cada rodada o dealer **passa para o próximo no
sentido horário**.

O jogador **à direita do dealer** é sempre o primeiro a declarar a promessa — e,
por consequência, o dealer é sempre o **último**.

## 5. Hierarquia das cartas

Da mais fraca para a mais forte:

```
4 < 5 < 6 < 7 < 8 < 9 < 10 < Q < J < K < A < 2 < 3 < Joker < 7♦ < A♠ < 7♥ < 4♣
```

Cinco cartas têm força **especial** e não seguem o próprio valor:

- Joker (o baralho leva **um** só)
- 7 de ouros
- Ás de espadas
- 7 de copas
- **4 de paus — a carta mais forte do jogo**

Os quatros comuns continuam sendo as cartas mais fracas. A hierarquia é uma
tabela explícita, e não uma conta sobre o valor numérico da carta.

Não há naipe a seguir e não há trunfo.

### Desempate por naipe

Duas cartas do mesmo valor não valem o mesmo: o **naipe** as separa, na ordem
do truco.

```
♦ < ♠ < ♥ < ♣
```

O valor manda e o naipe desempata, então um 5♣ ganha de um 5♥ e perde para
qualquer 6. Com isso a hierarquia é uma **ordem total**: não há duas cartas com
a mesma força no baralho, e nenhuma mão empata.

## 6. Promessas

Depois do reparto, cada jogador declara **quantas mãos acha que vai vencer**.
Vale de `0` até `o número de cartas que ele recebeu`.

A ordem começa no jogador à direita do dealer e segue no sentido horário.

## 7. A regra do último

**A soma das promessas não pode ser igual ao número de cartas distribuídas para
cada jogador.**

Como o último a declarar é quem fecha a soma, é ele quem carrega a proibição.

Exemplo — 4 jogadores, 5 cartas cada, promessas 2, 1 e 1 (soma 4): o quarto
jogador **não pode** dizer 1, porque 2+1+1+1 = 5. Ele pode 0, 2, 3, 4 ou 5.

A regra também **obriga**. Com 3 jogadores e 1 carta cada, promessas 0 e 1
(soma 1): o terceiro não pode dizer 0, então é obrigado a dizer 1.

A interface impede a escolha inválida; o servidor a recusa de todo jeito.

## 8. Rodadas de uma carta — às cegas

**Toda rodada de 1 carta é às cegas**: a primeira da partida, e cada uma que
volta quando o ciclo dos repartos recomeça. O jogador recebe **1 carta e não
pode
ver a própria**. Ele vê a carta de todos os outros.

Isto é uma limitação **real**, e não visual: o cliente não recebe o naipe nem o
valor da própria carta antes de ela ser jogada.

A regra do último continua valendo.

## 9. Jogando

Todos jogam uma carta por mão. **Não existe passar** e **não existe comprar**.

A carta mais forte leva a mão. Quem levou a mão **começa a próxima**. A
primeira mão sai com o jogador à direita do dealer — o mesmo que abriu as
promessas.

A rodada acaba quando as cartas acabam. O total de mãos é sempre igual ao
número de cartas que cada um recebeu.

## 10. Pontuação

```
pontos perdidos = |promessa − mãos conquistadas|
nova pontuação  = max(0, pontuação atual − pontos perdidos)
```

Cumprir a promessa exatamente custa **0**. Fazer mãos **a mais** dói tanto
quanto fazer **a menos** — é isto que faz vencer uma mão nem sempre ser bom.

A pontuação **nunca fica negativa**: quem tem 1 ponto e deveria perder 3 termina
em 0, e não em −2.

## 11. Eliminação

Ao final de cada rodada, quem chegou a **0** é eliminado. Quando resta um só
jogador, ele é o **vencedor da partida**, e nenhuma rodada nova começa.

Se uma rodada zerar **todos** os que restavam ao mesmo tempo, vence quem chegou
**mais perto do zero** — o cálculo sem o piso decide: quem tinha 3 e perdeu 3
parou exato em 0 e ganha de quem tinha 1 e perdeu 3, que parou dois abaixo. Os
saldos negativos aparecem no placar, para dar para ver quem passou menos. Quem
parou no **mesmo** saldo divide a vitória: é **empate**, e a cadeira em que cada
um sentou não desempata nada.

## 11-A. Regras da casa (opcionais)

Duas regras ligadas na **criação da mesa**, e fixas até o fim da partida —
trocá-las no meio seria mudar o que vale uma carta que alguém já recebeu.
Desligadas por padrão.

### Cangar

Cartas de **valor igual se anulam**: elas saem da disputa, e a mão vai para a
carta mais forte que **sobrou** — mesmo que seja uma carta fraca.

As **manilhas** (as cinco especiais) não se anulam. Cada uma é única no
baralho, então elas nem teriam com quem.

Se **tudo** se anular — três valetes e dois dois, por exemplo — a mão **não é
de ninguém**: não conta para promessa nenhuma, e **quem saiu nela sai de novo**
na mão seguinte. Numa rodada assim o total de mãos pode ser menor que o número
de cartas do reparto.

### Porcão

O **4♠** mata o **4♣** — e exclusivamente ele.

- Com o 4♣ na mão, o 4♠ é a **carta mais forte** e leva, mesmo que haja outra
  manilha na mesa.
- Sem o 4♣ na mão, o 4♠ é a **carta mais fraca do baralho**, abaixo do 4♦.

Com o cangar também ligado: o 4♠ **armado** (com o zap na mesa) se comporta como
manilha e não se anula; **desarmado**, ele é um quatro comum e se anula como
qualquer outro.

## 12. Máquina de estados

```
WAITING_FOR_PLAYERS → DEALING → MAKING_PROMISES → PLAYING_TRICK
                                                       ↕
                                    ROUND_RESULT → PLAYER_ELIMINATION → …
                                                                    → GAME_OVER
```

O sistema recusa toda ação incompatível com o estado atual: carta na fase de
promessas, promessa depois da fase de promessas, duas cartas na mesma mão,
jogada fora da vez, ação de quem foi eliminado, rodada nova com um só jogador.

## 13. Autoridade

O **servidor** é a autoridade final. O cliente manda apenas intenções —
`makePromise(n)`, `playCard(cardId)` — e nunca decide a própria promessa, a
própria pontuação, quem ganhou uma mão, que carta ele recebeu, a ordem dos
jogadores, quem é o dealer, se uma jogada é válida ou quem foi eliminado.

O servidor valida, em toda ação: que o jogador está vivo, que é a vez dele, que
a fase é a certa, e — na jogada — que a carta está de fato com ele e ainda não
foi jogada.

---

## Ambiguidades resolvidas

Pontos que o documento original não fecha, e a escolha feita aqui:

1. **Empate na mão.** Não existe: o naipe desempata (`♦ < ♠ < ♥ < ♣`) e o
   baralho leva um coringa só, então as cinco especiais são únicas. A
   hierarquia é uma ordem total.
2. **Rodada às cegas.** É **toda** rodada de 1 carta, e não só a primeira da
   partida.
3. **Todos eliminados na mesma rodada.** Vence quem chegou mais perto do zero,
   pelo cálculo sem o piso; mesmo saldo é empate, com mais de um campeão.
4. **Mão anulada pelo cangar.** Quem saiu nela sai de novo na seguinte: ela
   não aconteceu para ninguém, inclusive para a ordem.
5. **Porcão com outra manilha na mesa.** Com o zap presente, o 4♠ é a carta
   mais forte da mão e leva — o 7♥ na mesa não muda isso.
