"""A tipografia do baralho: ranks de canto e o wordmark do verso.

Duas famílias, duas métricas, e cada uma existe por um motivo:

    rank      cap height 24, traço 5, chanfro 3, contraforma 6.
              É o "K" do canto superior esquerdo. O tamanho não é gosto: com
              corpo de 176px, as quatro fileiras de pips do 9 e do 10 pedem
              ~80px de campo, o que deixa 48px por ponta para o índice. Um
              rank de cap 32 mais o pip de canto dá 50 e não fecha.

    miúda     5x7, só J O K E R. É a legenda que corre pelas bordas da carta de
              coringa. Não divide métrica com os ranks de propósito: cap 24 na
              borda de uma carta de 128 seria maior que o próprio bufão.

Cada glyph é uma lista de faixas (y0, y1, [(x0, x1), ...]), inclusivas nas duas
pontas. Faixa é mais fácil de manter consistente do que 24 linhas de ASCII por
glyph, e deixa o traço e a contraforma visíveis como números em vez de algo que
se conta no olho.
"""


def _spans_to_pts(w, h, bands):
    pts = set()
    for y0, y1, spans in bands:
        for y in range(y0, y1 + 1):
            for x0, x1 in spans:
                for x in range(x0, x1 + 1):
                    pts.add((x, y))
    assert all(0 <= x < w and 0 <= y < h for x, y in pts), "o glyph escapou da caixa"
    return pts


def _band_pts(spec):
    w, bands = spec
    h = max(y1 for _, y1, _ in bands) + 1
    return _spans_to_pts(w, h, bands), w, h


def _rot180(spec):
    """Gira as faixas 180 graus. O 9 é o 6 girado, e escrever assim garante
    que ele continue sendo mesmo depois de alguém mexer no 6."""
    w, bands = spec
    h = max(y1 for _, y1, _ in bands) + 1
    out = []
    for y0, y1, spans in bands:
        out.append((h - 1 - y1, h - 1 - y0,
                    [(w - 1 - x1, w - 1 - x0) for x0, x1 in spans]))
    return w, sorted(out)


# ------------------------------------------------------------------ ranks ---
# cap 24, traço 5, contraforma 6, chanfro 3 nos cantos externos.

D0 = (16, [
    (0, 0, [(3, 12)]), (1, 1, [(2, 13)]), (2, 2, [(1, 14)]),
    (3, 4, [(0, 15)]),
    (5, 5, [(0, 5), (10, 15)]),
    (6, 17, [(0, 4), (11, 15)]),
    (18, 18, [(0, 5), (10, 15)]),
    (19, 20, [(0, 15)]),
    (21, 21, [(1, 14)]), (22, 22, [(2, 13)]), (23, 23, [(3, 12)]),
])

D2 = (16, [
    (0, 0, [(3, 12)]), (1, 1, [(2, 13)]), (2, 2, [(1, 14)]),
    (3, 4, [(0, 15)]),
    (5, 6, [(0, 4), (11, 15)]),
    (7, 9, [(11, 15)]),
    (10, 10, [(10, 15)]),
    (11, 11, [(9, 14)]), (12, 12, [(8, 13)]), (13, 13, [(7, 12)]),
    (14, 14, [(6, 11)]), (15, 15, [(5, 10)]), (16, 16, [(4, 9)]),
    (17, 17, [(3, 8)]), (18, 18, [(2, 7)]),
    (19, 23, [(0, 15)]),
])

D3 = (16, [
    (0, 0, [(3, 12)]), (1, 1, [(2, 13)]), (2, 2, [(1, 14)]),
    (3, 4, [(0, 15)]),
    (5, 8, [(11, 15)]),
    (9, 13, [(5, 15)]),
    (14, 18, [(11, 15)]),
    (19, 20, [(0, 15)]),
    (21, 21, [(1, 14)]), (22, 22, [(2, 13)]), (23, 23, [(3, 12)]),
])

# A diagonal e um traco de 4, nao o preenchimento ate a haste: cheia, o 4 vira
# um triangulo macico com um rabo e perde a contraforma, que e o que o olho usa
# para separar um 4 de um A.
D4 = (17, [
    (0, 23, [(10, 13)]),
    (3, 3, [(7, 10)]), (4, 4, [(6, 9)]), (5, 5, [(5, 8)]),
    (6, 6, [(4, 7)]), (7, 7, [(3, 6)]), (8, 8, [(2, 5)]),
    (9, 9, [(1, 4)]),
    (10, 13, [(0, 3)]),
    (14, 18, [(0, 16)]),
])

D5 = (16, [
    (0, 4, [(0, 15)]),
    (5, 9, [(0, 4)]),
    (10, 13, [(0, 11)]),
    (14, 17, [(11, 15)]),
    (18, 18, [(10, 15)]),
    (19, 20, [(0, 15)]),
    (21, 21, [(1, 14)]), (22, 22, [(2, 13)]), (23, 23, [(3, 12)]),
])

D6 = (16, [
    (0, 0, [(4, 13)]), (1, 1, [(2, 14)]), (2, 2, [(1, 15)]),
    (3, 4, [(0, 15)]),
    (5, 5, [(0, 4), (11, 15)]),
    (6, 9, [(0, 4)]),
    (10, 12, [(0, 15)]),
    (13, 17, [(0, 4), (11, 15)]),
    (18, 18, [(0, 5), (10, 15)]),
    (19, 20, [(0, 15)]),
    (21, 21, [(1, 14)]), (22, 22, [(2, 13)]), (23, 23, [(3, 12)]),
])

D7 = (15, [
    (0, 4, [(0, 14)]),
    (5, 6, [(9, 14)]), (7, 8, [(8, 13)]), (9, 10, [(7, 12)]),
    (11, 12, [(6, 11)]), (13, 14, [(5, 10)]), (15, 16, [(4, 9)]),
    (17, 18, [(3, 8)]), (19, 20, [(2, 7)]),
    (21, 23, [(1, 6)]),
])

D8 = (16, [
    (0, 0, [(3, 12)]), (1, 1, [(2, 13)]), (2, 2, [(1, 14)]),
    (3, 4, [(0, 15)]),
    (5, 8, [(0, 4), (11, 15)]),
    (9, 12, [(0, 15)]),
    (13, 17, [(0, 4), (11, 15)]),
    (18, 18, [(0, 5), (10, 15)]),
    (19, 20, [(0, 15)]),
    (21, 21, [(1, 14)]), (22, 22, [(2, 13)]), (23, 23, [(3, 12)]),
])

D9 = _rot180(D6)

# -- A : ápice chanfrado, contraforma triangular, travessão de 4 --------------
LA = (17, [
    (0, 1, [(6, 10)]),
    (2, 3, [(5, 11)]),
    (4, 5, [(4, 12)]),
    (6, 7, [(3, 13)]),
    (8, 9, [(2, 6), (10, 14)]),
    (10, 11, [(1, 5), (11, 15)]),
    (12, 14, [(0, 4), (12, 16)]),
    (15, 18, [(0, 16)]),
    (19, 23, [(0, 4), (12, 16)]),
])

# -- J : serifa superior, haste à direita, gancho quadrado -------------------
LJ = (14, [
    (0, 3, [(3, 13)]),
    (4, 16, [(9, 13)]),
    (17, 19, [(0, 4), (8, 13)]),
    (20, 23, [(0, 13)]),
])

# -- Q : o anel do zero mais a cauda saindo pela base direita ----------------
# A cauda desce 2px abaixo da caixa de 24. É de propósito, e é como uma cauda
# de Q se comporta; gen_card posiciona o pip do canto por RANK_BOX_H, então ela
# pende dentro da folga em vez de empurrar o pip para baixo.
LQ = (20, [
    (0, 0, [(3, 12)]), (1, 1, [(2, 13)]), (2, 2, [(1, 14)]),
    (3, 4, [(0, 15)]),
    (5, 5, [(0, 5), (10, 15)]),
    (6, 16, [(0, 4), (11, 15)]),
    (17, 17, [(0, 4), (11, 16)]),
    (18, 18, [(0, 5), (10, 17)]),
    (19, 20, [(0, 15), (12, 18)]),
    (21, 21, [(1, 14), (13, 19)]),
    (22, 22, [(2, 13), (14, 19)]),
    (23, 25, [(15, 19)]),
])

# -- K : haste e dois braços diagonais que se encontram no meio --------------
LK = (17, [
    (0, 1, [(0, 4), (12, 16)]),
    (2, 3, [(0, 4), (11, 15)]),
    (4, 5, [(0, 4), (10, 14)]),
    (6, 7, [(0, 4), (9, 13)]),
    (8, 9, [(0, 4), (8, 12)]),
    (10, 13, [(0, 11)]),
    (14, 15, [(0, 4), (8, 12)]),
    (16, 17, [(0, 4), (9, 13)]),
    (18, 19, [(0, 4), (10, 14)]),
    (20, 21, [(0, 4), (11, 15)]),
    (22, 23, [(0, 4), (12, 16)]),
])

# O 10 é o único rank de dois caracteres. Um "1" e um "0" da fonte dariam 32px
# de coluna -- quase 30% da largura do corpo, e o índice comeria a carta. Ele
# tem um par próprio, condensado.
TEN_ONE = (7, [
    (0, 0, [(3, 6)]), (1, 1, [(2, 6)]), (2, 3, [(1, 6)]),
    (4, 23, [(2, 6)]),
])

TEN_ZERO = (14, [
    (0, 0, [(3, 10)]), (1, 1, [(2, 11)]), (2, 2, [(1, 12)]),
    (3, 4, [(0, 13)]),
    (5, 5, [(0, 5), (8, 13)]),
    (6, 17, [(0, 4), (9, 13)]),
    (18, 18, [(0, 5), (8, 13)]),
    (19, 20, [(0, 13)]),
    (21, 21, [(1, 12)]), (22, 22, [(2, 11)]), (23, 23, [(3, 10)]),
])

TEN_GAP = 2

_DIGITS = {2: D2, 3: D3, 4: D4, 5: D5, 6: D6, 7: D7, 8: D8, 9: D9}
_LETTERS_RANK = {"a": LA, "j": LJ, "q": LQ, "k": LK}

# Caixa nominal do rank. Todo glyph cabe nela; só a cauda do Q desce abaixo.
RANK_BOX_H = 24


def _ten():
    one, w1, h = _band_pts(TEN_ONE)
    zero, w0, h0 = _band_pts(TEN_ZERO)
    off = w1 + TEN_GAP
    return one | {(x + off, y) for x, y in zero}, off + w0, max(h, h0)


def rank(r):
    """(pontos, largura, altura) do rank de canto.

    Aceita 2..10 como int e 'a'/'j'/'q'/'k' como str. Não aceita 0 nem 1 -- o
    baralho francês não tem essas cartas, e deixar passar só mascara um bug na
    tabela de ranks de quem chamou.
    """
    if r == 10:
        return _ten()
    if isinstance(r, int):
        assert r in _DIGITS, f"rank numérico inválido: {r}"
        return _band_pts(_DIGITS[r])
    return _band_pts(_LETTERS_RANK[r])


# ------------------------------------------------------------ fonte miuda ---
# 5x7, so as letras de JOKER. E a legenda que corre pelas bordas da carta de
# coringa; nao e tipografia de rank e nao divide metrica com ela de proposito --
# cap 24 na borda de uma carta de 128 seria maior que o proprio bufao.

MICRO = {
    "J": ["..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
}
MICRO_H = 7
MICRO_GAP = 2


def label(text, scale=1, bold=0):
    """(pontos, largura, altura) de uma palavra na fonte miuda, deitada.

    bold engrossa a haste em x: cada pixel e repetido bold vezes a frente, o
    que soma bold a largura da palavra. E o borrao de sempre da pixel art --
    engrossar dobrando a escala tambem dobraria a altura, e a legenda ja usa a
    borda inteira do corpo.
    """
    pts = set()
    x = 0
    for ch in text:
        rows = MICRO[ch]
        for dy, row in enumerate(rows):
            for dx, c in enumerate(row):
                if c == "#":
                    for sy in range(scale):
                        for sx in range(scale + bold):
                            pts.add((x + dx * scale + sx, dy * scale + sy))
        x += (len(rows[0]) + MICRO_GAP) * scale
    return pts, x - MICRO_GAP * scale + bold, MICRO_H * scale
