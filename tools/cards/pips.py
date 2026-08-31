"""Naipes ♠ ♥ ♦ ♣ e o arranjo de pips por rank.

Cada pip é escrito como **meia-largura** e espelhado por `_mirror`. A simetria
passa a ser propriedade do código em vez de algo que eu tenho de acertar
contando pixel dos dois lados -- que foi exatamente o que falhou quando estes
pips eram gerados por composição de discos: a rasterização não batia nos dois
lados e o espada saía com o ombro torto.

Os dois tamanhos pequenos são desenhados à mão porque nesse tamanho cada pixel
conta: a diferença entre um losango limpo e um serrilhado é a inclinação ser
exatamente 45 graus, e nenhuma fórmula acerta isso sozinha. O pip do ás, em
38px, é composto -- ali a construção se sustenta e desenhar 40 linhas à mão por
naipe não se pagaria. Ele também passa pelo espelho, pela mesma razão.

    field   16px   o pip repetido no campo central
    corner  12px   sob o rank, na coluna do canto
    ace     38px   o pip único e grande do ás
"""

SUITS = ("spades", "hearts", "diamonds", "clubs")

# Naipes vermelhos: define a tinta dos pips e das figuras.
RED_SUITS = ("hearts", "diamonds")

GLYPH = {"spades": "♠", "hearts": "♥", "diamonds": "♦", "clubs": "♣"}

FIELD_W = 16
CORNER_W = 12


def _mirror(rows):
    """Espelha uma meia-largura na largura cheia."""
    return [r + r[::-1] for r in rows]


def _pts(rows):
    w = len(rows[0])
    assert all(len(r) == w for r in rows), "bitmap com linhas de larguras diferentes"
    pts = {
        (x, y)
        for y, row in enumerate(rows)
        for x, c in enumerate(row)
        if c == "#"
    }
    return pts, w, len(rows)


# ------------------------------------------------------------------ field ---
# Meia-largura de 8 colunas -> 16 no total. As diagonais andam 1px por linha,
# 45 graus exatos: é o que separa um pip limpo de um serrilhado.

_FIELD_HALF = {
    # Ponta em cima, corpo cheio, dois lobos e a haste embaixo.
    "spades": [
        ".......#",
        "......##",
        ".....###",
        "....####",
        "...#####",
        "..######",
        ".#######",
        "########",
        "########",
        "########",
        "########",
        ".#######",
        ".###..##",
        "......##",
        "......##",
        "....####",
        "...#####",
    ],
    # Dois lobos com a covinha de 2px, afunilando até uma ponta de 2px.
    "hearts": [
        "..####..",
        ".######.",
        "########",
        "########",
        "########",
        "########",
        "########",
        ".#######",
        "..######",
        "...#####",
        "....####",
        ".....###",
        "......##",
        ".......#",
    ],
    # 45 graus dos dois lados. Um losango mais alto que largo exigiria dois
    # passos por pixel em algum trecho, e o degrau irregular aparece.
    "diamonds": [
        ".......#",
        "......##",
        ".....###",
        "....####",
        "...#####",
        "..######",
        ".#######",
        "########",
        "########",
        ".#######",
        "..######",
        "...#####",
        "....####",
        ".....###",
        "......##",
        ".......#",
    ],
    # Três discos de 8px que se fundem, mais haste e pé. Separá-los com um vão
    # de 1px -- que era a versão anterior -- deixa os lobos laterais lendo como
    # dois quadrados soltos ao lado do pip, não como parte dele.
    "clubs": [
        "......##",
        ".....###",
        "....####",
        "....####",
        "....####",
        "..######",
        ".#######",
        "########",
        "########",
        "########",
        "########",
        ".#######",
        "..######",
        "......##",
        "......##",
        "....####",
        "...#####",
    ],
}


# ----------------------------------------------------------------- corner ---
# Meia-largura de 6 colunas -> 12 no total. Mesmas silhuetas, uma escala abaixo:
# no canto o pip fica do tamanho do rank, que é a proporção de um baralho real.

_CORNER_HALF = {
    "spades": [
        ".....#",
        "....##",
        "...###",
        "..####",
        ".#####",
        "######",
        "######",
        "######",
        ".#####",
        ".##..#",
        ".....#",
        "...###",
        "..####",
    ],
    "hearts": [
        "..###.",
        ".#####",
        "######",
        "######",
        "######",
        ".#####",
        "..####",
        "...###",
        "....##",
        ".....#",
    ],
    "diamonds": [
        ".....#",
        "....##",
        "...###",
        "..####",
        ".#####",
        "######",
        "######",
        ".#####",
        "..####",
        "...###",
        "....##",
        ".....#",
    ],
    "clubs": [
        "....##",
        "...###",
        "...###",
        "...###",
        ".#####",
        "######",
        "######",
        "######",
        "######",
        ".#####",
        ".....#",
        ".....#",
        "...###",
        "..####",
    ],
}


def field(suit):
    """Pip repetido no campo central."""
    return _pts(_mirror(_FIELD_HALF[suit]))


def corner(suit):
    """Pip da coluna de canto, sob o rank."""
    return _pts(_mirror(_CORNER_HALF[suit]))


# -------------------------------------------------------------------- ace ---
# O pip do ás é o pip do campo reamostrado, não outro desenho.
#
# Foi outro desenho -- composto por discos -- e o resultado é que o ás e o campo
# de uma mesma carta mostravam dois espadas diferentes. Reamostrar resolve os
# dois problemas de uma vez: a silhueta é literalmente a mesma, e como as
# escalas em x e em y são iguais, uma aresta de 45 graus continua de 45 graus.
# Uma aresta a 45 graus em qualquer escala é um degrau de 1px por linha, que é
# exatamente o que faz o pip pequeno ler limpo.


def _resample(rows, factor):
    """Reamostra o bitmap por cobertura de área, com corte em meio pixel.

    Vizinho mais próximo dobraria o passo da serrilha; cobertura de área mantém
    a aresta em 1px por linha, porque a razão entre as escalas é 1.
    """
    h, w = len(rows), len(rows[0])
    W, H = round(w * factor), round(h * factor)
    src = [[1.0 if c == "#" else 0.0 for c in r] for r in rows]
    out = []
    for Y in range(H):
        y0, y1 = Y / factor, (Y + 1) / factor
        line = []
        for X in range(W):
            x0, x1 = X / factor, (X + 1) / factor
            area = 0.0
            for sy in range(int(y0), min(h, int(y1) + 1)):
                oy = min(y1, sy + 1) - max(y0, sy)
                if oy <= 0:
                    continue
                for sx in range(int(x0), min(w, int(x1) + 1)):
                    ox = min(x1, sx + 1) - max(x0, sx)
                    if ox > 0:
                        area += src[sy][sx] * ox * oy
            line.append("#" if area >= (x1 - x0) * (y1 - y0) / 2 else ".")
        out.append("".join(line))
    return out


def ace(suit, w):
    """Pip único e grande do ás, na largura pedida."""
    assert w % 2 == 0, "largura par: o espelho parte a caixa ao meio"
    half = _resample(_FIELD_HALF[suit], w / 2 / len(_FIELD_HALF[suit][0]))
    return _pts(_mirror(half))


# ----------------------------------------------------------------- layout ---
# Onde cada pip do campo cai, em coordenadas normalizadas: coluna L/C/R e uma
# altura t de 0 (topo do campo) a 1 (base). Pip com t > 0.5 sai rotacionado
# 180 graus, como num baralho de verdade -- é o que faz a carta ler igual de
# cabeça para baixo.
#
# Os arranjos são os do baralho francês: o 7 é o 6 com um pip extra no alto da
# coluna do meio, o 8 é o 7 com o par desse pip embaixo, o 9 é quatro pares
# mais o centro, o 10 é quatro pares mais dois no meio.

L, C, R = 0.0, 0.5, 1.0

_T3 = 1 / 3
_T6 = 1 / 6

PIP_LAYOUT = {
    2: [(C, 0.0), (C, 1.0)],
    3: [(C, 0.0), (C, 0.5), (C, 1.0)],
    4: [(L, 0.0), (R, 0.0), (L, 1.0), (R, 1.0)],
    5: [(L, 0.0), (R, 0.0), (C, 0.5), (L, 1.0), (R, 1.0)],
    6: [(L, 0.0), (R, 0.0), (L, 0.5), (R, 0.5), (L, 1.0), (R, 1.0)],
    7: [(L, 0.0), (R, 0.0), (C, 0.25), (L, 0.5), (R, 0.5), (L, 1.0), (R, 1.0)],
    8: [
        (L, 0.0), (R, 0.0), (C, 0.25), (L, 0.5), (R, 0.5), (C, 0.75),
        (L, 1.0), (R, 1.0),
    ],
    9: [
        (L, 0.0), (R, 0.0), (L, _T3), (R, _T3), (C, 0.5),
        (L, 1 - _T3), (R, 1 - _T3), (L, 1.0), (R, 1.0),
    ],
    10: [
        (L, 0.0), (R, 0.0), (C, _T6), (L, _T3), (R, _T3),
        (L, 1 - _T3), (R, 1 - _T3), (C, 1 - _T6), (L, 1.0), (R, 1.0),
    ],
}
