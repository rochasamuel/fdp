# tools/cards — o baralho

Gerador pixel-art do baralho frances de FDP: 52 cartas, 2 coringas e o verso,
em SVG de 128x192.

```sh
python3 gen_card.py          # escreve out/svg/ (55 arquivos)
FDP_CARDS_PNG=1 python3 gen_card.py     # tambem escreve out/png/
FDP_CARDS_PIXIL=1 python3 gen_card.py   # tambem escreve out/pixil/ (Pixilart)
FDP_CARDS_OUT=../../apps/web/public/cards python3 gen_card.py
python3 test_cards.py        # invariantes, sem dependencia nenhuma
xdg-open demo.html           # a bancada: grade, leque e lupa
```

## Os modulos

| arquivo        | o que e |
|----------------|---------|
| `gen_card.py`  | desenha a carta (moldura, corpo de papel) e estampa a face; escreve SVG/PNG/.pixil |
| `pips.py`      | os quatro naipes, desenhados em meia-largura e espelhados |
| `glyphs.py`    | ranks de canto (cap 24) e a fonte miuda da legenda JOKER |
| `court.py`     | J, Q e K como meia-figura girada, e o coringa de corpo inteiro |
| `backs.py`     | os oito padroes de verso |
| `test_cards.py`| os invariantes |
| `demo.html`    | conferencia visual |
| `reference/`   | o que sobrou do gerador de UNO do `nuo`, fora do build |

## Nomes dos arquivos

```
out/svg/fdp-{spades|hearts|diamonds|clubs}-{a|2..10|j|q|k}.svg
out/svg/fdp-joker-{red|black}.svg
out/svg/fdp-back-{weave|zigzag|argyle|bloom|ripple|maze|basket|planet}.svg
```

O verso e trocavel: sao oito arquivos e o jogo escolhe um pelo nome. Todos
usam a mesma paleta de proposito -- sao versos do mesmo baralho, e quem troca de
verso no meio da partida tem de continuar reconhecendo as cartas como do mesmo
jogo.

`backs.py` tem duas familias, e a diferenca importa para quem for escrever a
proxima: **trama** (`weave`, `zigzag`, `argyle`, `bloom`, `ripple`, `maze`,
`basket`) e uma regra por pixel ou um ladrilho repetido, escala para qualquer
campo sem ajuste; **emblema**
(`planet`) e um desenho centralizado, cujas proporcoes sao fracoes do campo --
acompanham a resolucao, mas uma proporcao muito diferente distorce.

Naipe e rank saem do nome, entao da para montar a URL direto do estado do jogo:

```ts
type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
type Rank = 'a' | 2|3|4|5|6|7|8|9|10 | 'j' | 'q' | 'k'
type Card = { suit: Suit; rank: Rank } | { suit: 'joker'; rank: 'red' | 'black' }

type Back =
  | 'weave' | 'zigzag' | 'argyle' | 'bloom'
  | 'ripple' | 'maze' | 'basket' | 'planet'

const cardSrc = (c: Card) => `/cards/svg/fdp-${c.suit}-${c.rank}.svg`
const backSrc = (b: Back) => `/cards/svg/fdp-back-${b}.svg'
```

## Cor

O baralho e uma tinta sobre papel -- preto nos naipes pretos, vermelho nos
vermelhos -- com uma excecao: **as figuras**. O que faz uma figura ler como
figura, e nao como silhueta, e o contraste entre coroa dourada, pele, manto e
contorno preto. Sao seis cores fixas (`COURT` em `gen_card.py`) mais o manto,
que acompanha o naipe: vermelho nos vermelhos, azul nos pretos. Preto seria a
escolha obvia para espadas e paus, e e a errada -- o manto encostaria no
contorno e a figura viraria uma mancha.

Indice e pips continuam na tinta do naipe, entao a carta segue lendo vermelho
ou preto de longe.

`court.py` pinta **papeis** (`ink`, `skin`, `gold`, `robe`...), nao cores;
`gen_card` resolve. E o que deixa o manto trocar de cor sem duplicar desenho, e
`court.ROLES` e o contrato entre os dois -- com teste.

O coringa e a excecao da excecao: nao e meia-figura girada, e um bufao de corpo
inteiro, de pe. O que faz a carta ler dos dois lados e a legenda `JOKER` que
corre pelas duas bordas, uma girada 180 graus em relacao a outra. A legenda e
mobilia da carta, como o indice de canto, entao quem a estampa e o `gen_card` --
nao o `court.py`.

## Resolucao

A carta e `32*K x 48*K`, com `K = 4` -- 128x192. Moldura, raio, insets e
tamanhos de pip saem de `K`, e pips e figuras sao geometria parametrizada pela
largura: mudar `K` nao custa arte nova. Os pips pequenos (campo e canto) sao desenhados a
mao: nesse tamanho a diferenca entre um losango limpo e um serrilhado e a
diagonal ser exatamente 45 graus, e nenhuma formula acerta isso sozinha. O pip
do as e o do campo **reamostrado**, nao outro desenho -- e o que garante que o
as e o miolo da mesma carta mostrem o mesmo espada. Os ranks sao bitmaps de
faixa em cap 24, dimensionados para o orcamento de layout explicado em
`glyphs.py`.

O baralho ocupa ~7,2 MB crus e ~1,3 MB comprimido (~21 KB por carta na rede). Se
isso pesar, `FDP_CARDS_PNG=1` emite PNG indexado, bem menor -- ao custo das
classes CSS por parte.

## Sombra e animacao

A carta nao tem fio interno na cor do naipe: ele foi removido para devolver 8px
de cada eixo ao corpo, e a leitura de cor num leque ja vem da tinta dos pips.

O gerador nao assa sombra nenhuma no SVG, e nao emite `width`/`height`. Isso e
de proposito: a sombra vira `filter: drop-shadow()` no CSS (que segue o alpha e
respeita os cantos arredondados, ao contrario de `box-shadow`), e o tamanho fica
com o CSS, o que faz o `transform-origin` cair no centro real da carta -- o que
um leque e um hover precisam. As diretivas completas estao em
`reference/uno_card.md`, que continua valendo palavra por palavra: mesma grade,
mesmo formato de saida.

Cada cor sai como um `<path>` com classe semantica (`.f-ink`, `.f-paper-0`,
`.f-frame-hi`, ...), entao da para recolorir ou animar uma parte da carta por
CSS sem gerar arquivo novo.
