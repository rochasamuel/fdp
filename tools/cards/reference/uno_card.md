# UNO pixel card — diretivas de sombra e animação (React)

Referência para reconstruir em React o sombreamento e as animações validados em
`demo.html`. Os assets são gerados por `gen_card.py`.

---

## 0. O baralho

55 arquivos em `svg/`: 4 naipes × (dígitos 0–9 + 3 de ação), mais 2 coringas,
mais o verso. ~26 KB cada, ~1,5 MB no total.

```
svg/uno-{red|yellow|green|blue}-{0..9|skip|reverse|draw2}.svg
svg/uno-wild-{change|draw4}.svg
svg/uno-back.svg
```

Os coringas usam `wild` no lugar do naipe. Não é um naipe de verdade — é para o
padrão de nome continuar em duas partes e o helper abaixo servir para tudo. O
verso é a única exceção: não tem naipe nem face, então também não tem duas
partes.

Naipe e face saem do nome do arquivo, então dá para montar a URL direto do
estado do jogo:

```ts
type Suit = 'red' | 'yellow' | 'green' | 'blue'
type Face = number | 'skip' | 'reverse' | 'draw2'
type Card = { suit: Suit; face: Face } | { suit: 'wild'; face: 'change' | 'draw4' }

const cardSrc = (c: Card) => `/cards/svg/uno-${c.suit}-${c.face}.svg`
const BACK_SRC = '/cards/svg/uno-back.svg'
```

### O tipo

Todos os dígitos compartilham as mesmas métricas — é isso que faz o baralho
parecer uma fonte só, não dez desenhos:

| | |
|---|---|
| altura de caixa | 32 px |
| traço | 6 px |
| chanfro | 4 px nos cantos externos, 2 px nos contadores |
| contadores | 8 px de largura |
| largura | 18–22 px conforme o dígito |

`0`, `1`, `2`, `3` e `4` foram traçados da folha de referência (máscara branca
extraída por carta e reamostrada para altura 32). `5`, `6`, `7`, `8` e `9` foram
desenhados nas mesmas métricas, já que a folha só mostrava aqueles cinco.

Os dígitos dos cantos são uma face fina separada (6×9, traço 2), em
`glyphs.SMALL` — **não** uma redução dos grandes, que nesse tamanho vira mingau.

### Os símbolos de ação

Em `symbols.py`. Cada tamanho veio de medir a referência como fração da carta e
aplicar essa fração à grade 64×96:

| face | símbolo central | canto |
|---|---|---|
| `skip` | círculo 34×34, parede 4, barra 3 | ⊘ 11×11 |
| `reverse` | duas setas 22×22 a 45°, separação 10 | mesmas setas, 9×9, sep 7 → 16×16 |
| `draw2` | "+" 15×15 + "2" compacto 15×26 | "+2" 13×9 |
| `change` | o próprio oval, dividido em 4 | 2×2 de blocos 9×9 |
| `draw4` | 4 mini-cartas 14×20 sobrepostas (37×45) | "+4" 13×9 |

Os coringas são os únicos símbolos **multicoloridos**. Uma função de símbolo pode
devolver um 4º elemento, `paint(x, y) -> nome do papel`, que o `gen_card`
resolve contra a paleta — assim o `symbols.py` não precisa saber nada de cores.
`None` como papel significa "usa o preenchimento padrão"; é o que dá a borda
branca das mini-cartas.

**`change` não tem glifo central.** O símbolo é o oval da própria carta,
dividido em quatro — mesma elipse, mesma inclinação, mesma posição de todas as
outras cartas, só muda o preenchimento. Por isso `FACES["change"][0]` é `None` e
quem desenha é o `gen_card`, junto com o corpo.

> A cruz divisória segue os **eixos do oval**, não os da tela. Dividir pelos
> eixos da tela deixa os quadrantes muito desiguais, porque o oval é inclinado
> 25° — o vermelho vira uma lasca e o azul uma laje. No frame do oval os quatro
> ficam a 1% de área um do outro.

As quatro cores usam o tom médio do corpo de cada naipe, então a roda bate com
as cartas que ela representa. Ordem, em leitura no frame do oval: vermelho,
azul, amarelo, verde.

**As mini-cartas do `+4`** são desenhadas de trás para a frente num mapa de
papéis, não compostas por união de conjuntos: as sobreposições precisam ocluir.
Cada mini-carta assenta margem de tinta, depois borda branca, depois a cor — daí
a da frente recortar limpo a de trás. Como elas já trazem a própria margem de
tinta, `CENTER_OUTLINE["draw4"] = 0` desliga a passada de contorno externa; com
ela ligada o cluster ganhava um halo preto grosso.

Três coisas que só apareceram ao renderizar, e que valem se você mexer nelas:

- **A separação das setas do `reverse` é o parâmetro crítico.** As cabeças se
  sobrepõem no eixo `x+y`; se `sep` for pequeno demais o contorno preto de 2px
  não consegue separá-las e as duas fundem num borrão. `sep=10` a 22px funciona.
- **A parede e a barra do `skip` têm que ser finas.** Parede 5 e barra 4 comiam
  o furo inteiro — sobravam duas frestas e o símbolo lia como círculo riscado,
  não como proibido. Parede 4 / barra 3 deixa dois triângulos limpos.
- **O canto do `reverse` usa a mesma construção do centro**, com `sep=7` a 9px
  por seta. Uma barra horizontal de duas pontas foi tentada antes e lia como
  encanamento, não como setas. Duas setas diagonais cabem — só precisam de `sep`
  grande o bastante para o contorno de 1px separar as cabeças. O custo é que
  essa marca de canto fica maior que a dos dígitos (16×16 contra 6×9).

### O verso

Corpo quase preto dos coringas + oval vermelho + "NUO" amarelo — o nome do jogo,
e de propósito não o da caixa: o baralho é desenhado do zero, e a palavra do
verso era a única peça que seria cópia. Nada de novo na
carta em si: é a mesma moldura, o mesmo rim, o mesmo oval inclinado a 25° na
mesma posição. Só a colorway e o glifo central mudam.

Duas decisões que valem a pena conhecer antes de mexer:

**O oval usa a rampa de corpo do vermelho, não a rampa de oval.** `ELL` no
vermelho (`#F76A5B…`) é um destaque: existe para ser mais claro que o corpo
vermelho atrás dele. Sobre preto não há nada para ele ser mais claro que, e ele
lê como uma mancha rosa. Descer um degrau — `ELL = COLORWAYS["red"]["RAMP"][0:3]`,
com o antigo topo virando `GLOSS` — devolve o vermelho saturado do verso de
fábrica e ainda deixa o anel e o crescente com para onde clarear.

**O verso não tem marca de canto.** Os dígitos de canto existem para você ler
uma carta no leque; um leque de versos não tem o que ler. `symbols.NO_CORNER`
desliga o passo 7 do `build_card`.

#### A palavra

Letras novas em `glyphs.py` — só `U`, `N` e `O`, porque o verso é a única carta
com palavra. Métricas em meia escala dos dígitos, perto o bastante para lerem
como a mesma fonte um corpo abaixo:

| | dígitos | UNO |
|---|---|---|
| altura de caixa | 32 | 18 |
| traço | 6 | 4 |
| contadores | 8 | 4 |
| chanfro | 4 / 2 | 2 / 1 |
| contorno | 2 | 1 |

O tamanho não é gosto. A palavra é carimbada girada 25°, e girar custa largura:
a caixa inclinada mede `w·cos + h·sin`. Com caixa 18 a palavra dá ~47 px de
largura, que é o máximo que ainda sobra folga dos dois lados dentro dos 52 px
úteis do corpo. Caixa 20 encosta no rim.

O contorno é de 1 px, e não de 2 como o dos dígitos grandes, pela mesma razão:
a 2 px ele comeria os contadores de 4 px pelos dois lados e fecharia as letras.
É o mesmo fio que as marcas de canto usam.

A diagonal do `N` tem 3 px, não 4 como as hastes. A 4 ela encosta em cada haste
por duas linhas inteiras e os contadores fecham num tarjão preto no meio da
letra; a 3 sobra 1 px de folga, que o contorno depois fecha só na junção.

O espaçamento entre letras é 3 px. Menos que isso e os anéis de contorno de
letras vizinhas se tocam — a palavra sai soldada por uma ponte preta.

#### O ângulo

25°, o mesmo do oval — o baralho tem um ângulo, não dois. O sinal é invertido:
a palavra sobe para a direita, o eixo maior do oval sobe para a direita a 65°.
Os dois se inclinam para o mesmo lado, e a palavra **cruza** o oval em vez de
subir por ele.

> Correr a palavra pelo eixo maior parece a escolha óbvia (é onde cabem 62 px em
> vez de 45), mas esse eixo está a 65° da horizontal: "NUO" sairia quase na
> vertical. Das direções que ainda se leem, 25° subindo é a mais larga — 44,7 px
> de oval, contra 40,8 px na horizontal e 34,4 px descendo pelo eixo menor.
> Descer também brigaria com a inclinação do oval em vez de acompanhá-la.

`symbols.rotate_pts` rasteriza a palavra girada por **mapeamento inverso**:
percorre os pixels de destino e pergunta a cada um de onde ele veio. Girar os
pontos de origem para a frente deixa buracos — a 25° vários pixels de origem
caem no mesmo destino e outros são pulados — e buraco dentro de glifo enche de
tinta de contorno. O serrilhado que sobra é absorvido pelo contorno, igual ao de
qualquer outro glifo.

---

## 1. Contrato do SVG

Cada carta é gerada com estas garantias. **Se você regenerar os assets, mantenha
todas** — cada uma existe por causa de um bug concreto.

| Propriedade | Valor | Por quê |
|---|---|---|
| `viewBox` | `0 0 64 96` | É exatamente a carta. Nenhuma margem. |
| `width` / `height` | **ausentes** | O CSS controla o tamanho. |
| Silhueta | preenche `0..63 × 0..95` | `transform-origin` cai no centro real. |
| Estrutura | 17 `<path>`, um por cor (18 no verso) | Sem costuras sob transform. |
| Classes | `u-frame`, `u-rim`, `u-body-0..5`, … | Permite tematizar via CSS. |
| `shape-rendering` | `crispEdges` | Mantém o pixel duro ao escalar. |
| Sombra | **não existe no arquivo** | Feita em CSS. Ver §2. |

Proporção da carta: **2:3**.

### Não asse a sombra no SVG

Três motivos, todos verificados durante a construção:

1. **Sombra assada é opaca.** Não escurece a carta de baixo, **cobre** — vira
   tarja preta no leque.
2. **Não anima.** A sombra do hover precisa crescer.
3. **Desloca a arte.** Com sombra, a arte ocupava 62×94 num viewBox 64×96,
   deslocada. Girar o leque pivotaria fora do centro.

Se algum dia precisar da versão com sombra assada (sprite estático, export para
engine que não faz filtro), o gerador ainda suporta:
`build_card("32bit", COLORWAYS["red"], baked_shadow=True)`.

---

## 2. Sombra: `drop-shadow`, nunca `box-shadow`

A carta tem cantos arredondados e pixels transparentes. `box-shadow` segue a
caixa retangular do elemento e desenha um halo quadrado em volta da carta
arredondada. `filter: drop-shadow()` segue o canal alpha.

```css
:root {
  /* blur 0 = sombra dura, coerente com pixel art */
  --uno-shadow-rest:  drop-shadow(3px 4px 0 rgba(0,0,0,.45));
  --uno-shadow-hover: drop-shadow(6px 12px 0 rgba(0,0,0,.5));
}
```

Aumentar o blur no hover dá sensação de "levantar do feltro", mas quebra um
pouco o look pixelado. Escolha um dos dois e seja consistente na tela toda.

---

## 3. Como consumir o SVG no React

Duas opções, e a escolha **decide se dá para trocar o naipe por CSS**.

### `<img>` — simples, sem tematização

```tsx
<img className="uno-card" src={cardUrl} alt="1 vermelho" />
```

As classes internas (`u-body-0` etc.) **não são alcançáveis pelo CSS da
página**. Precisa de um arquivo por naipe.

### SVG inline — permite tematizar (recomendado)

Com Vite, use `vite-plugin-svgr`:

```ts
// vite.config.ts
import svgr from 'vite-plugin-svgr'
export default { plugins: [svgr()] }
```

```tsx
import CardArt from './svg/uno-red-1.svg?react'

<CardArt className="uno-card" role="img" aria-label="1 vermelho" />
```

Com 40 cartas, importar uma a uma nao escala. Use `import.meta.glob`:

```tsx
const ART = import.meta.glob('./svg/*.svg', { eager: true, query: '?react', import: 'default' })
const artFor = (suit: Suit, n: number) => ART[`./svg/uno-${suit}-${n}.svg`]
```

Agora `.uno-card .u-body-0 { fill: … }` funciona.

---

## 4. Componente

Separe **transform de layout** (o ângulo no leque) de **transform de interação**
(o lift do hover) em dois elementos. Se os dois moram no mesmo elemento, o
`:hover` precisa redeclarar o ângulo do leque, e você acaba com regras
`nth-child` duplicadas — foi assim no `demo.html`, e não escala.

```tsx
type Suit = 'red' | 'yellow' | 'green' | 'blue'

export function UnoCard({ suit, angle, drop, onPlay }: {
  suit: Suit; angle: number; drop: number; onPlay?: () => void
}) {
  return (
    <li
      className="uno-slot"
      style={{ '--angle': `${angle}deg`, '--drop': `${drop}px` } as React.CSSProperties}
    >
      <button className={`uno-card suit-${suit}`} onClick={onPlay}>
        <CardArt aria-hidden="true" />
      </button>
    </li>
  )
}
```

```css
/* elemento externo: só posição no leque */
.uno-slot {
  transform: rotate(var(--angle)) translateY(var(--drop));
  transform-origin: bottom center;      /* pivô no fundo, como cartas na mão */
  margin-right: calc(var(--uno-card-w) * -0.55);   /* a sobreposição */
}
.uno-slot:last-child { margin-right: 0; }

/* elemento interno: só interação */
.uno-card {
  width: var(--uno-card-w, 120px);
  aspect-ratio: 2 / 3;                  /* o SVG não tem width/height */
  display: block; padding: 0; border: 0; background: none; cursor: pointer;

  filter: var(--uno-shadow-rest);
  transition: transform .18s cubic-bezier(.2,.8,.3,1),
              filter    .18s cubic-bezier(.2,.8,.3,1);
}
.uno-card:hover,
.uno-card:focus-visible {
  transform: translateY(-32px) scale(1.08);
  filter: var(--uno-shadow-hover);
}
.uno-slot:hover, .uno-slot:focus-within { z-index: 10; }
```

O `z-index` vai no **slot**, não na carta: é o slot que é irmão dos outros slots
no flex.

---

## 5. Matemática do leque

```tsx
const SPREAD = 6    // graus entre cartas vizinhas
const ARC    = 10   // px que as pontas descem

export function Hand({ cards }: { cards: Card[] }) {
  const n = cards.length
  const mid = (n - 1) / 2
  return (
    <ul className="uno-hand">
      {cards.map((c, i) => {
        const off = i - mid                      // -mid … +mid
        const t   = mid === 0 ? 0 : off / mid    // -1 … 1
        return (
          <UnoCard
            key={c.id}
            suit={c.suit}
            angle={off * SPREAD}
            drop={t * t * ARC}                   // 0 no centro, ARC nas pontas
          />
        )
      })}
    </ul>
  )
}
```

```css
.uno-hand { display: flex; list-style: none; margin: 0; padding: 0; }
```

`t * t` dá a curva do arco (parabólica). Com `mid === 0` (uma carta só) o guard
evita divisão por zero.

---

## 6. As duas pilhas

A pergunta que aparece primeiro é se vale pré-gerar um SVG por estado de pilha,
para não pesar no browser. **Não vale**, e o gargalo real está em outro lugar.

Pré-gerar não resolve porque o descarte muda toda jogada — você trocaria "montar
8 elementos no DOM" por "gerar e parsear um arquivo novo por turno". Pior: um SVG
de pilha precisaria de sombra assada, que a §1 já registra como opaca. Sombra
assada numa pilha é literalmente o bug que aquele aviso descreve, uma tarja preta
sobre a carta de baixo. E os estados são incontáveis: quais cartas, em que ordem,
em que ângulo.

O que pesa é a contagem de nós:

```
1 carta   = 27,7 KB, 17 nós <path>, 1977 subpaths
50 cartas = 850 nós, 98.850 subpaths, 1,4 MB
```

### Corte a profundidade renderizada, não a qualidade

O estado guarda a pilha inteira — o UNO precisa dela, porque quando a compra
acaba o descarte é reembaralhado. A **renderização** mostra só o topo.

Medido, comparando uma pilha de 30 cartas com a mesma pilha cortada em 8: 14% dos
pixels diferem, e **os 14% são todos franja** — o halo de quinas nas bordas. O
centro é idêntico, porque está coberto. 8 elementos em vez de 50 são 136 nós em
vez de 850.

> Uma coisa que só apareceu ao medir: a franja **não converge**. Quanto maior a
> pilha, mais chances de uma quina espetar num lugar ainda vazio, então o monte
> real incha devagar para sempre e um corte fixo congela esse inchaço. Por isso o
> espalhamento cresce com a contagem (`t` abaixo): 8 cartas renderizadas imitam o
> volume de 30. Sem isso a pilha parece do mesmo tamanho o jogo inteiro.

### O espalhamento

Vem do **índice da carta na pilha**, por hash. Não de `Math.random()`, que
reembaralha a pilha visualmente a cada re-render do React; e não de um hash do id
da carta, porque o UNO tem duas de cada número e a cópia cairia exatamente em
cima da gêmea.

```ts
const DEPTH = 8    // cartas renderizadas; o resto do monte fica só no estado

function hash(n: number) {
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d)
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39)
  return ((n ^ (n >>> 15)) >>> 0) / 2 ** 32
}

function scatter(i: number, pileSize: number, isTop: boolean) {
  const t = Math.min(1, pileSize / 24)          // o monte engorda até 24 cartas
  const spread = isTop ? 5 : 16 + 4 * t         // graus
  const off = (9 + 3.5 * t) / 100               // fração da largura da carta
  return {
    rot: (hash(i * 3 + 1) * 2 - 1) * spread,
    dx: (hash(i * 3 + 2) * 2 - 1) * off * 100,
    dy: (hash(i * 3 + 3) * 2 - 1) * off * 100,
  }
}
```

A carta do topo fica em ±5° em vez de ±16°: ela é a informação mais importante da
tela e precisa ser lida rápido. As de baixo é que fazem a bagunça.

```tsx
export function Discard({ pile }: { pile: Card[] }) {
  const shown = pile.slice(-DEPTH)
  const base = pile.length - shown.length
  return (
    <div className="stack stack-discard">
      {shown.map((c, k) => {
        const i = base + k                       // índice na pilha inteira
        const top = k === shown.length - 1
        const s = scatter(i, pile.length, top)
        return (
          <img
            key={i}
            className="card"
            src={cardSrc(c)}
            alt={top ? describe(c) : ''}
            style={{ '--rot': `${s.rot}deg`, '--dx': `${s.dx}%`, '--dy': `${s.dy}%` }
                   as React.CSSProperties}
          />
        )
      })}
    </div>
  )
}
```

`key={i}` usa o índice na pilha **inteira**, não o da fatia. Com o índice da
fatia, toda carta jogada faz a janela deslizar e o React recicla os nós errados —
as cartas trocam de posição sozinhas. Com o índice absoluto, cada carta mantém sua
chave: entra uma no topo, sai a mais funda.

`alt` só na carta do topo. As de baixo são decorativas, e um leitor de tela
anunciando oito cartas soterradas é ruído.

### A pilha de compra

Todas as cartas são o mesmo arquivo. O browser busca e decodifica
`uno-back.svg` **uma vez**, independente de quantas você mostre — o custo é só o
nó. Sem rotação, deslocamento fixo, e a espessura em função de quantas restam,
para o monte afinar visivelmente durante a partida.

```tsx
const DRAW_MAX = 6

export function Draw({ remaining, onDraw }: { remaining: number; onDraw(): void }) {
  const n = Math.max(1, Math.min(DRAW_MAX, Math.ceil(remaining / 8)))
  return (
    <button className="stack stack-draw" onClick={onDraw} disabled={remaining === 0}
            aria-label={`Comprar carta — ${remaining} restantes`}>
      {Array.from({ length: n }, (_, k) => {
        const d = (n - 1 - k) * 2
        return <img key={k} className="card" src={BACK_SRC} alt=""
                    style={{ '--dx': `${-d}px`, '--dy': `${-d}px` } as React.CSSProperties} />
      })}
    </button>
  )
}
```

### A sombra vai em lugares diferentes nas duas

```css
.stack { position: relative; width: var(--uno-card-w); aspect-ratio: 2 / 3; }
.stack .card {
  position: absolute; inset: 0; width: 100%;
  transform: translate(var(--dx, 0), var(--dy, 0)) rotate(var(--rot, 0deg));
}

/* Descarte: sombra POR CARTA. É ela que separa uma carta da de baixo — sem isso
   a pilha vira uma mancha de cartas coladas. */
.stack-discard .card { filter: var(--uno-shadow-rest); }

/* Compra: UMA sombra, no contêiner. filter num pai desenha um único halo em
   volta do alpha do conjunto todo, em vez de 6 halos escondidos uns sob os
   outros. Mesmo resultado visual, 1 passada de filtro em vez de 6. */
.stack-draw { filter: var(--uno-shadow-rest); }
.stack-draw .card { filter: none; }
```

Total: 8 elementos filtrados no descarte, 1 na compra. Dentro do que a §9
considera irrelevante.

### Uma consequência que só aparece jogando

O espalhamento é recalculado a cada render, e a carta do topo usa ±5° enquanto as
de baixo usam ±16°. Então, quando você descarta duas seguidas, a que **deixa** de
ser topo salta de ±5° para ±16°. A `transition: transform` que a carta já tem
transforma esse salto num acomodar — a carta gira e se enfia na bagunça enquanto a
nova cai por cima. Não foi planejado, mas é o comportamento certo, então ficou.

### A simulação

`demo.html` tem a mecânica rodando: clique no monte para comprar, clique numa
carta da mão para descartar. Ela existe para exercitar o corte de profundidade, a
estabilidade do espalhamento e o reembaralho — **não valida jogada**, qualquer
carta da mão pode ir para o descarte. Também é onde a matemática do leque do §5
finalmente roda, em vez das regras `nth-child` fixas que a demo do topo usa.

A demo re-renderiza tudo a cada clique, de propósito: é o pior caso para o
espalhamento. Se ele viesse de `Math.random()`, a pilha inteira se reembaralharia
na tela a cada carta comprada.

> **Falta desenhar:** o coringa no descarte precisa mostrar a cor escolhida, ou
> a mesa não sabe o que está valendo. `uno-wild-change.svg` mostra as quatro. A
> escolha não está no arquivo — tem que sair do estado do jogo, como um anel
> colorido atrás da carta do topo ou uma troca de `u-body-*` via CSS (o que exige
> o SVG inline, §3).

---

## 7. Animação e arrastar

Quatro movimentos, e nenhum deles é decoração — cada um responde a uma pergunta
que o jogador faz:

| movimento | o que responde |
|---|---|
| comprar | de onde veio esta carta na minha mão? |
| descartar | qual carta acabou de ser jogada? |
| leque se reorganizando | quantas cartas eu tenho agora? |
| a carta coberta se acomodando | a de cima é a que vale |

O último já existe e saiu de graça: o espalhamento é recalculado a cada render e
o topo usa ±5° contra ±16° do resto, então a carta que deixa de ser topo gira
sozinha para dentro da bagunça. Ver §6.

### Animar obriga a usar SVG inline

`shape-rendering="crispEdges"` está no `<svg>` raiz como **atributo de
apresentação**. Atributo de apresentação tem especificidade 0 — qualquer regra
CSS o vence:

```css
.uno-card svg { shape-rendering: geometricPrecision; }
```

Mas isso só alcança o SVG se ele estiver **inline**. Com `<img>` o interior é
inacessível (§3), e a saída da armadilha #1 — trocar para `geometricPrecision`
quando aparecerem costuras girando — deixa de existir. Carta que gira é
exatamente o caso da armadilha.

Isso briga com o §6, que recomenda `<img>` nas pilhas para não inflar o DOM. A
divisão que resolve as duas:

| onde | como | por quê |
|---|---|---|
| mão | SVG inline | gira, escala, é arrastada |
| topo do descarte | SVG inline | recebe a carta que chega e depois se acomoda |
| resto do descarte | `<img>` | nunca se move depois de coberta |
| pilha de compra | `<img>` | não gira nunca |

Na prática: ~7 cartas inline, o resto `<img>`. 119 nós em vez dos 850 do baralho
inteiro inline.

> **Não verificado.** A armadilha #1 sempre foi suspeita, não medição — esta
> máquina não tem browser. O que está estabelecido é que, se a costura aparecer,
> `<img>` não deixa você consertar.

### Pointer Events, não HTML5 drag-and-drop

A API nativa de arrastar é a escolha errada aqui, por três motivos concretos:

1. **A imagem de arraste é um bitmap.** O browser tira uma foto do elemento e
   arrasta a foto. Você não a estiliza, não a inclina, não põe sombra nela — e
   toda a arte da carta depende disso.
2. **Não funciona em toque** sem polyfill. Metade dos jogadores está no celular.
3. **`dragover` dispara de forma irregular**, e o alvo de soltura precisa de
   `preventDefault()` em todo evento só para ser considerado válido.

`setPointerCapture` dá mouse, toque e caneta num caminho de código só.

### O conflito dos três transforms

Três coisas querem o `transform` da mesma carta: o ângulo no leque, o lift do
hover, e o deslocamento do arrasto. O §4 já separa layout de interação em dois
elementos — é essa divisão que faz o arrasto caber sem um terceiro:

- **slot (`<li>`)** — o ângulo do leque. Durante o arrasto vai a `0deg`, porque
  carta na mão do jogador não fica torta.
- **carta (`<button>`)** — hover **ou** arrasto. São estados mutuamente
  exclusivos: quem está arrastando não está pairando.

```css
.uno-slot {
  transform: rotate(var(--angle)) translateY(var(--drop));
  transition: transform .18s cubic-bezier(.2,.8,.3,1);
}
.uno-slot:has(.dragging) { --angle: 0deg; --drop: 0px; z-index: 100; }

.uno-card {
  transform: translate(var(--drag-x, 0px), var(--drag-y, 0px));
  touch-action: none;     /* sem isto o browser rola a página em vez de arrastar */
}
.uno-card.dragging {
  transition: none;       /* com transition a carta fica atrás do dedo */
  cursor: grabbing;
}
```

Três coisas nesse bloco que não são óbvias:

**A transition vai no slot, não só na carta.** Sem ela a carta desendireita de
supetão ao começar o arrasto. É `transform` que está sendo transicionado, não
`--angle` — variável CSS não registrada com `@property` não interpola. Funciona
porque a troca da variável muda o valor computado de `transform`, e `transform`
interpola normalmente.

**`transition: none` na carta enquanto arrasta não é detalhe.** A transição de
`.18s` que dá o lift bonito no hover vira lag visível quando o alvo é o seu
próprio dedo.

**`z-index` no slot** — armadilha #5, é o slot que é irmão dos outros no flex.
E ele depende de `:has()`, porque quem ganha a classe `.dragging` é a carta.
Se precisar suportar browser sem `:has()`, ponha a classe no slot também em vez
de inferir pelo filho.

### O gancho

```tsx
function useDragCard(target: React.RefObject<HTMLElement>, onDrop: (hit: boolean) => void) {
  const from = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)

  const move = (el: HTMLElement, x: number, y: number) => {
    el.style.setProperty('--drag-x', `${x}px`)
    el.style.setProperty('--drag-y', `${y}px`)
  }

  return {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)  // o arrasto sobrevive ao
      from.current = { x: e.clientX, y: e.clientY }   // ponteiro sair da carta
      moved.current = false
      e.currentTarget.classList.add('dragging')
    },

    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      if (!from.current) return
      const dx = e.clientX - from.current.x
      const dy = e.clientY - from.current.y
      if (Math.hypot(dx, dy) > 5) moved.current = true   // abaixo disso é clique
      // Escrito direto no style, sem estado: um setState por pointermove são
      // 60+ renders do React por segundo para mover uma carta.
      move(e.currentTarget, dx, dy)
    },

    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      if (!from.current) return
      from.current = null
      const el = e.currentTarget
      el.classList.remove('dragging')     // devolve a transition -> a volta é animada
      move(el, 0, 0)

      const r = target.current?.getBoundingClientRect()
      const hit = !!r && e.clientX >= r.left && e.clientX <= r.right
                      && e.clientY >= r.top && e.clientY <= r.bottom
      // Sem arrasto, foi clique — jogar do mesmo jeito. Quem usa teclado nunca
      // vai arrastar, e obrigar a arrastar tornaria o jogo injogável para essa
      // pessoa.
      onDrop(moved.current ? hit : true)
    },

    // O browser cancela o ponteiro sozinho (gesto do sistema, chamada entrando).
    // Sem este handler a carta fica grudada no cursor para sempre.
    onPointerCancel(e: React.PointerEvent<HTMLElement>) {
      from.current = null
      e.currentTarget.classList.remove('dragging')
      move(e.currentTarget, 0, 0)
    },
  }
}
```

Soltar fora do alvo não precisa de código: `move(el, 0, 0)` com a transition de
volta já faz a carta voltar animada para o leque.

### A carta voando de um lugar para o outro

Comprar e descartar são a mesma coisa vista de dois ângulos: um elemento
desaparece de um lugar e aparece em outro, e você quer que o olho ligue os dois.
A técnica é FLIP — mede o retângulo antes, mede depois, anima a diferença.

À mão dá trabalho porque origem e destino vivem em componentes diferentes. Com
Motion (ex-Framer Motion), `layoutId` faz exatamente isso: mesma `layoutId` na
carta da mão e na carta do topo do descarte, e a biblioteca interpola entre as
duas posições sozinha.

```tsx
<motion.img layoutId={`card-${card.uid}`} className="uno-card" src={cardSrc(card)} />
```

E é aqui que a separação do §4 paga de novo: o Motion anima o `transform` do
elemento que ele controla. Se o ângulo do leque estivesse na mesma carta, os dois
brigariam pela propriedade. Estando no slot, não se encostam.

**A recomendação é usar a biblioteca.** FLIP entre componentes, saída animada de
elemento desmontado (`AnimatePresence`) e mola em vez de curva de bézier são três
problemas resolvidos que não valem reimplementar. O arrasto, ao contrário, vale
fazer à mão: o gancho acima tem 40 linhas e você fica dono do teste de acerto.

> **Não verificado.** Nenhuma dessas animações rodou. Em particular, a interação
> entre `layoutId` e o `filter: drop-shadow` da carta é o ponto que eu checaria
> primeiro — a armadilha #2 diz que `filter` cria containing block, e transição
> de layout compartilhado é onde isso costuma aparecer.

### O que o `prefers-reduced-motion` desliga

Não é tudo. Arrastar **é manipulação direta** — a carta seguir o dedo não é
enfeite, é a interface. O que sai são os enfeites:

```css
@media (prefers-reduced-motion: reduce) {
  .uno-card { transition: none; }
  .uno-card:hover { transform: none; }      /* mantém a sombra, tira o pulo */
  .stack-discard .dealt { animation: none; }  /* a carta aparece, não cai */
}
```

A carta arrastada continua seguindo o ponteiro, porque durante o arrasto a
transition já está desligada de qualquer jeito.

---

## 8. Trocar o naipe por CSS

Só com SVG inline (§3). Rampas completas em `COLORWAYS` no `gen_card.py`:

| role | red | yellow | green | blue |
|---|---|---|---|---|
| `u-rim` | `#6E1216` | `#8A5B08` | `#1B5320` | `#12386E` |
| `u-body-0` | `#E4483F` | `#F5CE45` | `#5BB44E` | `#3E7FD4` |
| `u-body-1` | `#D93A34` | `#EDC034` | `#4CA742` | `#3572C8` |
| `u-body-2` | `#CE322E` | `#E3B22B` | `#419A3A` | `#2E66BB` |
| `u-body-3` | `#BE2A29` | `#D6A222` | `#368B32` | `#275AAC` |
| `u-body-4` | `#AC2224` | `#C6911C` | `#2C7B2B` | `#204D9B` |
| `u-body-5` | `#951B20` | `#B27E17` | `#236A24` | `#1A4188` |
| `u-oval-0` | `#F76A5B` | `#FDE375` | `#7ACE68` | `#5A9AE8` |
| `u-oval-1` | `#EF564B` | `#F8D65B` | `#6AC25B` | `#4A8CDE` |
| `u-gloss` | `#FCA189` | `#FFF0AA` | `#A8E496` | `#8FBEF5` |

`u-frame`, `u-frame-hi`, `u-frame-shade`, `u-ink`, `u-paper*` são compartilhados
entre naipes — não mexa, é o que faz o baralho parecer um baralho só.

Nos coringas, `u-body-*` guarda a rampa quase preta, e as quatro cores (da roda
e das mini-cartas) saem em `u-suit-red`, `u-suit-yellow`, `u-suit-green` e
`u-suit-blue`. Esses
nomes existem justamente para serem estáveis: sem eles as cores caíam em
`u-c<índice>` e o mesmo vermelho ganhava nome diferente em cada coringa.

> **Atenção:** nas frentes existe `u-oval-0` e `u-oval-1`, mas **não**
> `u-oval-2`. A terceira cor do oval é idêntica à `body-0` (`#E4483F` no
> vermelho) e foi absorvida na mesma classe. Então recolorir `u-body-0` também
> muda a faixa de baixo do oval. É o comportamento certo para troca de naipe,
> mas surpreende se você tentar ajustar só o corpo.
>
> **No verso `u-oval-2` existe**, e é a única carta onde existe: lá as duas
> rampas vêm de naipes diferentes (corpo do coringa, oval do vermelho), então
> nenhuma cor colide. Uma regra escrita para as frentes vai errar o verso, e
> vice-versa.

O verso ainda tem três classes só dele, para a palavra:

| role | valor | |
|---|---|---|
| `u-mark-hi` | `#FDE375` | bisel de cima |
| `u-mark` | `#F5CE45` | preenchimento |
| `u-mark-shade` | `#C6911C` | bisel de baixo |

É a mesma estrutura de três partes que a rampa de papel dá aos dígitos — sem
ela a palavra sai chapada.

Alternativa mais limpa que CSS: gerar um SVG por naipe no `gen_card.py`
(`COLORWAYS` já tem os quatro) e usar `<img>`. Custa 4 arquivos de ~27 KB.

---

## 9. Performance

- `filter: drop-shadow` é composto na GPU mas **custa por elemento**. Com uma mão
  de 7 cartas é irrelevante; num deck de 40 visíveis, aplique a sombra só nas
  cartas interativas.
- **Não deixe `will-change` fixo** em todas as cartas — ele reserva memória de
  camada permanentemente. Coloque no pai que recebe hover:
  ```css
  .uno-hand:hover .uno-card { will-change: transform, filter; }
  ```
- Anime **só `transform` e `filter`**. Nunca `margin`, `top`, `width` — forçam
  layout a cada frame.

---

## 10. Acessibilidade

```css
@media (prefers-reduced-motion: reduce) {
  .uno-card { transition: none; }
  .uno-card:hover { transform: none; }   /* mantém a sombra, tira o movimento */
}
```

Use `<button>` na carta (como em §4) para receber foco por teclado, e espelhe
`:hover` com `:focus-visible` — está no CSS acima.

---

## 11. Armadilhas

1. **Costuras finas entre cores ao girar.** Troque `shape-rendering="crispEdges"`
   por `geometricPrecision` no SVG. `crispEdges` é melhor parado ou em escala
   inteira; `geometricPrecision` suaviza as bordas e é melhor girando.
2. **`filter` cria containing block.** Um filho `position: fixed` dentro de uma
   carta com filtro passa a se posicionar em relação à carta, não à viewport.
3. **SVG sem `width`/`height`.** Sempre defina `width` **e** `aspect-ratio: 2/3`
   no CSS. Sem isso o `<img>` pode cair no tamanho default do browser.
4. **`transform-origin` default é `50% 50%`.** Para leque, precisa ser
   `bottom center`, senão as cartas giram em torno do próprio meio e o leque
   abre errado.
5. **`z-index` no elemento errado.** Vai no slot (irmão no flex), não na carta.
6. **`touch-action` default rola a página.** Uma carta arrastável precisa de
   `touch-action: none`, senão no celular o gesto vira scroll e a carta não sai
   do lugar.
7. **`transition` ligada durante o arrasto.** A carta fica atrás do dedo. Desligue
   enquanto arrasta e religue ao soltar — é a religada que anima a volta.
8. **`overflow: hidden` ou `filter` no contêiner da mesa.** Os dois prendem a
   carta arrastada: o primeiro corta, o segundo cria containing block (item 2) e
   quebra qualquer camada de arraste `position: fixed`. A mesa não pode ter
   nenhum dos dois.
9. **`pointercancel` sem handler.** O browser cancela o ponteiro sozinho num
   gesto do sistema ou numa chamada entrando, e a carta fica grudada no cursor
   para sempre.

---

## 12. Regenerar os assets

```bash
python3 gen_card.py     # reescreve as 55 cartas em svg/
```

Três arquivos:

- `glyphs.py` — o tipo: os dígitos e as três letras do verso. Cada glifo é uma
  lista de faixas `(y0, y1, [(x0, x1), …])`, mais fácil de manter consistente
  que 32 linhas de ASCII por dígito. Mexa aqui para ajustar a fonte.
- `symbols.py` — os símbolos de ação e a palavra girada, gerados por geometria
  (círculo rasterizado, bandas a 45°, rotação por mapeamento inverso) em vez de
  ASCII, porque são paramétricos.
- `gen_card.py` — a carta (moldura, oval, gradiente) e os writers.

A divisão entre os dois primeiros é essa: `glyphs.py` desenha formas de letra,
`symbols.py` faz geometria. Por isso as letras `U`, `N` e `O` moram no primeiro
e a rotação de 25° que as inclina mora no segundo.

Flags no fim de `gen_card.py`: `SUITS`, `FACES`, `WILD_DECK`, `TIER`, `EMIT_PNG`,
`EMIT_PIXIL`. Hoje: 32-bit, só SVG. Os writers de PNG e `.pixil` continuam no
arquivo, desligados.

> O tier 16-bit **levanta `NotImplementedError`**. Os glifos são desenhados com
> altura de caixa 32, que só cabe na carta 32-bit; um baralho 16-bit precisaria
> de um segundo conjunto de dígitos. É erro explícito de propósito — antes disso
> ele devolvia silenciosamente um "1" para qualquer número.

> O `.pixil` nunca foi validado contra um export real do Pixilart — o schema foi
> escrito a partir da documentação. Se ligar `EMIT_PIXIL` e o Pixilart recusar,
> importe o PNG.

---

## Status de verificação

Verificado nesta máquina: geometria do SVG, paths reproduzindo o grid pixel a
pixel (0 divergências, 0 sobreposições), silhueta preenchendo o viewBox, XML
válido, links do `demo.html` resolvendo.

Verificado no gancho de arrasto do §7: o código foi extraído deste documento,
teve as anotações de tipo removidas e rodou em Node contra um alvo de retângulo
conhecido. Passam: clique parado joga a carta (dentro **e** fora do alvo, porque
clique não é arrasto); arrasto solto dentro do alvo joga; solto fora volta; a
borda exata do alvo conta como acerto e um pixel fora não conta; botão direito não
inicia arrasto; `pointerup` sem `pointerdown` é ignorado; `pointercancel` não joga
a carta, tira a classe, zera o deslocamento, e um `pointermove` depois dele não
mexe mais em nada; `setPointerCapture` é chamado.

**Não verificado no §7:** nada de CSS ou animação. `layoutId` com `filter`,
`:has()` no slot, a transição de `transform` disparada por troca de variável, e a
troca para `geometricPrecision` são todos raciocínio, não medição.

Verificado na simulação das pilhas: a lógica do `demo.html` foi executada fora do
browser, com um DOM de mentira, por 400 jogadas — 3 reembaralhos. Em todo passo as
54 cartas continuavam existindo sem duplicata entre compra, descarte e mão; o
descarte nunca passou de 8 elementos nem a compra de 6; o cache de elementos por
índice não vazou; re-renderizar sem mudar o estado não moveu nenhuma carta; e só a
carta do topo carrega `alt`.

**Não verificado:** o CSS e as animações dessa simulação em browser — mesma
limitação de sempre. O que rodou foi a lógica, não a pintura.

Verificado no verso especificamente: as 54 frentes saem byte a byte idênticas
depois das mudanças que o verso pediu no gerador; a palavra mais o contorno
ocupa x 9..55 num corpo que vai de 6 a 57, então sobra folga do rim dos dois
lados; as 18 classes do arquivo são todas semânticas (nenhuma caiu no
`u-c<índice>`).

**Não verificado:** o comportamento do CSS em browser — esta máquina não tem
browser instalado. O `demo.html` foi validado por leitura, não por execução.
