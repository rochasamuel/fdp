"""Os padrões de verso.

Cada verso é uma função que preenche o **campo** -- o retângulo interno da
carta, dentro das cintas de borda -- devolvendo um mapa `(x, y) → papel de cor`.
O `gen_card` desenha a moldura, as cintas e resolve os papéis; nada aqui sabe o
tamanho da carta nem em que cor vai sair.

Duas famílias, e a diferença importa para quem for escrever a próxima:

**Trama** (`weave`, `zigzag`, `argyle`, `bloom`, `ripple`, `maze`, `basket`)
é uma regra por pixel ou um
ladrilho repetido. Escala para qualquer campo sem ajuste, e é onde vale
adicionar padrões novos.

**Emblema** (`planet`) é um desenho centralizado sobre fundo liso. As proporções
são frações do campo, então acompanham a resolução, mas um campo com proporção
muito diferente distorce o desenho.

A paleta é a mesma nos seis, de propósito: são versos do mesmo baralho, e um
jogador que troca de verso no meio da partida tem de continuar reconhecendo as
cartas como do mesmo jogo.
"""

import math

ROLES = ("cream", "pink_l", "pink", "pink_d")


# ------------------------------------------------------------ primitivas ----


def _fill(out, w, h, role):
    for y in range(h):
        for x in range(w):
            out[(x, y)] = role


def _disc(out, cx, cy, r, role):
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                out[(x, y)] = role


def _ellipse_ring(out, cx, cy, a, b, t, role, cos_t=1.0, sin_t=0.0):
    for y in range(int(cy - b) - 2, int(cy + b) + 3):
        for x in range(int(cx - a) - 2, int(cx + a) + 3):
            dx, dy = x - cx, y - cy
            u = dx * cos_t + dy * sin_t
            v = -dx * sin_t + dy * cos_t
            outer = (u / a) ** 2 + (v / b) ** 2
            inner = (u / (a - t)) ** 2 + (v / (b - t)) ** 2
            if outer <= 1.0 < inner:
                out[(x, y)] = role


def _star(out, cx, cy, r, role):
    """Brilho de quatro pontas: duas hastes e o miolo."""
    for d in range(-r, r + 1):
        out[(cx + d, cy)] = role
        out[(cx, cy + d)] = role
    for d in (-1, 0, 1):
        out[(cx + d, cy)] = role
        out[(cx, cy + d)] = role


def _clip(out, w, h):
    """Descarta o que saiu do campo. As primitivas desenham solto de propósito
    -- recortar no fim é mais simples que passar limites para todas elas."""
    return {(x, y): r for (x, y), r in out.items() if 0 <= x < w and 0 <= y < h}


# ----------------------------------------------------------------- tramas ---


def weave(w, h):
    """Risca diagonal fina. O ciclo de quatro faixas -- e não de duas -- é o que
    impede a trama de ler como listra de pijama."""
    out = {}
    tones = ("pink", "cream", "pink_l", "cream")
    for y in range(h):
        for x in range(w):
            out[(x, y)] = tones[((x + y) // 3) % 4]
    return out


def zigzag(w, h):
    """Faixa diagonal larga com a borda em degrau.

    O degrau vem de quantizar x antes de calcular a faixa: sem isso a diagonal
    sai lisa, e o que a referência tem de característico é justamente a
    serrilha grossa.
    """
    out = {}
    step, band = 4, 11
    for y in range(h):
        for x in range(w):
            i = ((x // step) * step + (y // 2) * 2) // band
            out[(x, y)] = ("pink", "cream", "pink_d", "cream")[i % 4]
    return out


def argyle(w, h):
    """Losangos concêntricos a partir do centro -- o X grande da referência é o
    que sobra entre eles."""
    out = {}
    cx, cy = (w - 1) / 2, (h - 1) / 2
    for y in range(h):
        for x in range(w):
            d = abs(x - cx) * 1.55 + abs(y - cy)
            i = int(d // 8)
            out[(x, y)] = ("cream", "pink", "cream", "pink_l")[i % 4]
    return out


# Ladrilho da trama florida: um losango vazado com um ponto no vértice. Repetido
# em grade, os pontos de ladrilhos vizinhos se encontram e formam a segunda
# malha, deslocada -- que é o que dá profundidade à referência.
_BLOOM_TILE = [
    ".....pp.....",
    "....pPPp....",
    "...pP..Pp...",
    "..pP....Pp..",
    ".pP..dd..Pp.",
    "pP..dddd..Pp",
    "pP..dddd..Pp",
    ".pP..dd..Pp.",
    "..pP....Pp..",
    "...pP..Pp...",
    "....pPPp....",
    ".....pp.....",
]
_BLOOM_CHARS = {"p": "pink_l", "P": "pink", "d": "pink_d"}


def bloom(w, h):
    """Malha florida por ladrilho."""
    out = {}
    th, tw = len(_BLOOM_TILE), len(_BLOOM_TILE[0])
    for y in range(h):
        row = _BLOOM_TILE[y % th]
        for x in range(w):
            out[(x, y)] = _BLOOM_CHARS.get(row[x % tw], "cream")
    # A segunda malha: um ponto no encontro de quatro ladrilhos.
    for y in range(0, h + th, th):
        for x in range(0, w + tw, tw):
            for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (0, -1)):
                out[(x + dx - 1, y + dy - 1)] = "pink_d"
    return _clip(out, w, h)


def ripple(w, h):
    """Xadrez deformado por duas ondas cruzadas.

    O deslocamento e aplicado *antes* de decidir a casa, nao depois: deformar o
    resultado borraria as bordas; deformar a coordenada mantem cada quadrado com
    aresta dura e e a onda que entorta.

    A onda lenta tem comprimento da ordem da propria carta, e a rapida amplitude
    de um pixel. Amplitude perto do tamanho da casa -- que foi a primeira
    tentativa -- nao entorta o xadrez: dissolve ele em ruido.

    A terceira faixa de tom segue uma onda mais lenta e atravessada. Sem ela o
    xadrez le como grade regular e o efeito otico -- que e o ponto da referencia
    -- some.
    """
    out = {}
    cell = 5
    for y in range(h):
        dx = 4.5 * math.sin(y * 0.045) + 1.3 * math.sin(y * 0.27)
        for x in range(w):
            dy = 4.5 * math.sin(x * 0.065) + 1.3 * math.sin(x * 0.23)
            i = math.floor((x + dx) / cell) + math.floor((y + dy) / cell)
            if i % 2:
                lenta = math.sin((x + y * 0.6) * 0.045)
                out[(x, y)] = "pink" if lenta < 0.15 else "pink_l"
            else:
                out[(x, y)] = "cream"
    return out


# Meandro em espiral quadrada. O ladrilho tem 16 -- divisor de 96 e de 160, as
# medidas do campo -- entao ele fecha nas quatro bordas em vez de sair cortado.
_MAZE_TILE = [
    "PPPPPPPPPPPPPP..",
    "PPPPPPPPPPPPPP..",
    "PP..........PP..",
    "PP..........PP..",
    "PP..PPPPPP..PP..",
    "PP..PPPPPP..PP..",
    "PP..PP..PP..PP..",
    "PP..PP..PP..PP..",
    "PP..PP..PP..PP..",
    "PP..PP......PP..",
    "PP..PPPPPPPPPP..",
    "PP..PPPPPPPPPP..",
    "PP..............",
    "PP..............",
    "................",
    "................",
]


def maze(w, h):
    """Labirinto por ladrilho de meandro."""
    out = {}
    th, tw = len(_MAZE_TILE), len(_MAZE_TILE[0])
    for y in range(h):
        row = _MAZE_TILE[y % th]
        for x in range(w):
            out[(x, y)] = "pink" if row[x % tw] == "P" else "cream"
    return out


def basket(w, h):
    """Trancado: blocos de tres barras paralelas, alternando o sentido.

    O sentido alterna em xadrez -- horizontal, vertical, horizontal -- que e o
    que faz as barras parecerem passar por cima e por baixo umas das outras.
    """
    out = {}
    block, bar = 8, 3       # tres barras de 2px com 1px de folga cabem em 8
    for y in range(h):
        for x in range(w):
            horizontal = ((x // block) + (y // block)) % 2 == 0
            dentro = (y % block) if horizontal else (x % block)
            claro = (dentro % bar) == 2
            out[(x, y)] = "cream" if claro else ("pink" if horizontal else "pink_d")
    return out


# ---------------------------------------------------------------- emblema ---


def planet(w, h):
    """Planeta anelado num céu de brilhos."""
    out = {}
    _fill(out, w, h, "pink")
    cx, cy = (w - 1) / 2, h * 0.46
    _disc(out, cx, cy, w * 0.31, "cream")
    _disc(out, cx - w * 0.09, cy - h * 0.04, w * 0.19, "pink_l")
    _ellipse_ring(out, cx, cy + h * 0.02, w * 0.52, h * 0.10, 5, "cream",
                  cos_t=0.966, sin_t=-0.259)
    # Os brilhos vão numa grade deslocada, não aleatórios: sorteados, eles
    # se agrupam e o céu fica manchado.
    for i, (fx, fy, r) in enumerate((
        (0.13, 0.09, 4), (0.82, 0.12, 3), (0.20, 0.74, 3), (0.87, 0.60, 4),
        (0.50, 0.88, 4), (0.10, 0.42, 3), (0.90, 0.88, 3), (0.31, 0.20, 3),
        (0.68, 0.78, 3), (0.44, 0.09, 3), (0.14, 0.60, 2), (0.86, 0.34, 2),
    )):
        _star(out, round(w * fx), round(h * fy), r,
              "cream" if i % 3 else "pink_l")
    return _clip(out, w, h)


BACKS = {
    "weave": weave,
    "zigzag": zigzag,
    "argyle": argyle,
    "bloom": bloom,
    "ripple": ripple,
    "maze": maze,
    "basket": basket,
    "planet": planet,
}
