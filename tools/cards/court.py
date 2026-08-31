"""As figuras J, Q, K e o coringa, em cor.

Uma carta de figura de baralho francês é uma meia-figura girada 180 graus: o
desenho ocupa a metade de cima e reaparece de cabeça para baixo embaixo, o que
faz a carta ler igual dos dois lados. É o que está implementado aqui.

Quatro decisões que valem o comentário:

**Cor, não tinta única.** O resto do baralho é uma tinta sobre papel; as figuras
não. O que faz uma figura ler como figura -- e não como silhueta -- é o
contraste entre coroa dourada, pele, manto na cor do naipe e o contorno preto.
São seis cores, fixas, e só no miolo das figuras: índice e pips continuam na
tinta do naipe, então a carta segue lendo vermelho ou preto de longe.

**Papéis, não cores.** O canvas pinta nomes (`ink`, `skin`, `gold`, `robe`...) e
quem resolve para hexadecimal é o gen_card. É o que deixa o manto ser vermelho
nos naipes vermelhos e azul nos pretos sem duplicar desenho nenhum.

**Simetria imposta, assimetria deliberada.** A base -- coroa, rosto, manto -- é
escrita à esquerda e espelhada, então um erro de um pixel não deixa a figura
torta. O que vem *depois* do espelho é o que a carta de referência tem de
assimétrico: o cetro de um lado só e a faixa diagonal do manto. Sem isso a
figura vira totem.

**Composição, não bitmap.** Tudo é desenhado com primitivas em coordenadas
fracionárias da caixa, então a figura acompanha a resolução da carta.
"""

# Proporções escritas para esta caixa; tudo abaixo é fração dela.
REF_W, REF_H = 62, 84

# Os papéis de cor que o canvas pinta. gen_card resolve cada um.
ROLES = (
    "ink", "skin", "skin_sh", "gold", "gold_sh", "robe", "robe_sh", "white",
)


# ------------------------------------------------------------- primitivas ---


class _Canvas:
    """Pinta papéis de cor numa caixa de w x h, em coordenadas fracionárias.

    O modelo é de tinta: `pix[(x, y)] = papel`, e quem pinta por último ganha.
    Todo método recebe frações de 0 a 1 e converte para pixels aqui, num lugar
    só -- é o que faz a mesma figura servir a qualquer resolução de carta.
    """

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.pix = {}
        self.s = max(1, round(w / 31))  # espessura do traço

    def px(self, fx):
        return round(fx * (self.w - 1))

    def py(self, fy):
        return round(fy * (self.h - 1))

    def add(self, role, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.pix[(x, y)] = role

    # -- massas --
    def box(self, role, fx0, fy0, fx1, fy1):
        for y in range(self.py(fy0), self.py(fy1) + 1):
            for x in range(self.px(fx0), self.px(fx1) + 1):
                self.add(role, x, y)

    def poly(self, role, pts):
        """Preenche um polígono por varredura de linha. É o que permite ao
        manto ter ombro em diagonal em vez de ser um retângulo."""
        ppts = [(self.px(x), self.py(y)) for x, y in pts]
        ys = [p[1] for p in ppts]
        for y in range(min(ys), max(ys) + 1):
            xs = []
            for i in range(len(ppts)):
                x0, y0 = ppts[i]
                x1, y1 = ppts[(i + 1) % len(ppts)]
                if y0 == y1:
                    continue
                if min(y0, y1) <= y < max(y0, y1):
                    xs.append(x0 + (x1 - x0) * (y - y0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(round(xs[i]), round(xs[i + 1]) + 1):
                    self.add(role, x, y)

    def rrect(self, role, fx0, fy0, fx1, fy1, fr):
        x0, y0 = self.px(fx0), self.py(fy0)
        x1, y1 = self.px(fx1), self.py(fy1)
        r = round(fr * (self.w - 1))
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if _in_rr(x, y, x0, y0, x1, y1, r):
                    self.add(role, x, y)

    def tri(self, role, fcx, fy_apex, fy_base, fhalf):
        cx = self.px(fcx)
        ya, yb = self.py(fy_apex), self.py(fy_base)
        half = fhalf * (self.w - 1)
        n = max(1, yb - ya)
        for y in range(ya, yb + 1):
            hw = half * (y - ya) / n
            for x in range(round(cx - hw), round(cx + hw) + 1):
                self.add(role, x, y)

    # -- traços --
    def hline(self, role, fx0, fx1, fy, t=None):
        t = t or self.s
        x0, x1, y = self.px(fx0), self.px(fx1), self.py(fy)
        for dy in range(t):
            for x in range(x0, x1 + 1):
                self.add(role, x, y + dy)

    def vline(self, role, fx, fy0, fy1, t=None):
        t = t or self.s
        x, y0, y1 = self.px(fx), self.py(fy0), self.py(fy1)
        for dx in range(t):
            for y in range(y0, y1 + 1):
                self.add(role, x + dx, y)

    def line(self, role, fx0, fy0, fx1, fy1, t=None):
        t = t or self.s
        x0, y0, x1, y1 = self.px(fx0), self.py(fy0), self.px(fx1), self.py(fy1)
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        r = (t - 1) / 2
        for i in range(n + 1):
            cx = x0 + (x1 - x0) * i / n
            cy = y0 + (y1 - y0) * i / n
            for dy in range(-t, t + 1):
                for dx in range(-t, t + 1):
                    x, y = round(cx) + dx, round(cy) + dy
                    if (x - cx) ** 2 + (y - cy) ** 2 <= (r + 0.5) ** 2:
                        self.add(role, x, y)

    def disc(self, role, fcx, fcy, fr):
        cx, cy = self.px(fcx), self.py(fcy)
        r = fr * (self.w - 1)
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.add(role, x, y)

    def sprite(self, rows, fx, fy):
        """Estampa um bitmap ASCII com um caractere por papel de cor.

        Para os pedaços onde a composição por primitivas não chega -- uma mão,
        um crânio -- e onde escrever pixel a pixel é mais curto que empilhar
        cinco chamadas de traço.
        """
        ox, oy = self.px(fx), self.py(fy)
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                role = SPRITE_CHARS.get(ch)
                if role:
                    self.add(role, ox + dx, oy + dy)

    # -- fecho --
    def symmetrize(self):
        """Reescreve a metade direita como espelho da esquerda."""
        left = {(x, y): r for (x, y), r in self.pix.items() if x < self.w / 2}
        self.pix = dict(left)
        for (x, y), r in left.items():
            self.pix[(self.w - 1 - x, y)] = r

    def keyline(self, role="ink"):
        """Contorna a silhueta inteira. Sem isso a figura encosta no papel sem
        aresta e as cores claras -- pele, ouro -- somem no corpo da carta."""
        ring = set()
        for x, y in self.pix:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                p = (x + dx, y + dy)
                if p not in self.pix:
                    ring.add(p)
        for x, y in ring:
            self.add(role, x, y)


def _in_rr(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    if r <= 0:
        return True
    cx = x0 + r if x < x0 + r else (x1 - r if x > x1 - r else x)
    cy = y0 + r if y < y0 + r else (y1 - r if y > y1 - r else y)
    if cx == x or cy == y:
        return True
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.35


SPRITE_CHARS = {
    "K": "ink", "S": "skin", "s": "skin_sh", "G": "gold", "g": "gold_sh",
    "R": "robe", "r": "robe_sh", "W": "white",
}

# Uma mão fechada segurando a haste. Cinco linhas de ASCII saem mais curtas --
# e mais legíveis -- que a pilha de retângulos que desenharia o mesmo.
HAND = [
    ".KKKK.",
    "KSSSSK",
    "KSsSsK",
    "KSSSSK",
    "KSsSsK",
    ".KKKK.",
]


# ------------------------------------------------------------------ blocos --
# As faixas verticais da meia-figura, em fração da altura:
#   0.02 - 0.21  coroa ou chapéu
#   0.19 - 0.60  cabelo e rosto
#   0.58 - 0.66  gola
#   0.64 - 1.00  manto


def _robe(c):
    """Manto: ombro em diagonal, peitilho central, roseta no ombro e barra."""
    c.poly("robe", [
        (0.13, 0.64), (0.87, 0.64), (0.97, 0.78), (0.97, 0.985),
        (0.03, 0.985), (0.03, 0.78),
    ])
    c.poly("robe_sh", [
        (0.13, 0.64), (0.28, 0.64), (0.14, 0.985), (0.03, 0.985), (0.03, 0.78),
    ])
    # Roseta de ombro dos dois lados: e o ornamento que quebra a chapa de cor
    # do manto, que sem ele le como um barril pintado.
    c.disc("gold", 0.155, 0.735, 0.075)
    c.disc("ink", 0.155, 0.735, 0.045)
    c.disc("robe", 0.155, 0.735, 0.03)

    # Peitilho: faixa dourada com losangos na cor do manto.
    c.box("gold", 0.37, 0.695, 0.63, 0.985)
    c.vline("ink", 0.37, 0.695, 0.985, t=1)
    c.vline("ink", 0.625, 0.695, 0.985, t=1)
    for fy in (0.735, 0.845):
        c.poly("robe", [(0.50, fy - 0.032), (0.585, fy),
                        (0.50, fy + 0.032), (0.415, fy)])
        c.poly("ink", [(0.50, fy - 0.045), (0.598, fy),
                       (0.50, fy + 0.045), (0.402, fy)])
        c.poly("robe", [(0.50, fy - 0.030), (0.578, fy),
                        (0.50, fy + 0.030), (0.422, fy)])
        c.disc("gold", 0.50, fy, 0.022)
    c.hline("gold_sh", 0.37, 0.63, 0.79)

    # A regua encostada na base separa as duas metades; sem ela os mantos se
    # encontram e a figura vira uma ampulheta.
    c.hline("gold", 0.03, 0.97, 0.945)
    c.hline("ink", 0.03, 0.97, 0.968, t=2)


def _collar(c):
    """Gola de folhos com corrente e pingente."""
    c.box("white", 0.14, 0.585, 0.86, 0.645)
    c.hline("ink", 0.14, 0.86, 0.585, t=1)
    for i in range(9):
        c.vline("ink", 0.18 + i * 0.085, 0.588, 0.642, t=1)
    c.hline("ink", 0.14, 0.86, 0.640, t=1)
    c.hline("gold", 0.14, 0.86, 0.650)


def _hair(c, long_):
    """Cabelo por baixo do rosto, sobrando como moldura. `long_` desce ate a
    gola -- e o que separa a dama do rei alem da barba."""
    bottom = 0.66 if long_ else 0.615
    c.rrect("ink", 0.16, 0.18, 0.84, bottom, 0.13)
    if long_:
        c.poly("ink", [(0.16, 0.40), (0.10, 0.52), (0.12, 0.66), (0.22, 0.66)])
        c.vline("robe_sh", 0.135, 0.50, 0.63, t=1)


def _face(c, rank):
    """Rosto: pele, olhos com brilho, nariz sombreado, e a barba do rei."""
    c.rrect("skin", 0.235, 0.19, 0.765, 0.565, 0.11)
    c.poly("skin_sh", [(0.235, 0.30), (0.30, 0.30), (0.28, 0.50), (0.235, 0.50)])

    c.hline("ink", 0.285, 0.415, 0.245)                 # sobrancelha
    c.box("ink", 0.315, 0.295, 0.395, 0.345)            # olho
    c.box("white", 0.325, 0.305, 0.345, 0.325)          # brilho

    c.vline("skin_sh", 0.465, 0.345, 0.425)             # nariz
    c.hline("skin_sh", 0.44, 0.52, 0.425)
    c.hline("ink", 0.455, 0.50, 0.44, t=1)

    if rank == "k":
        c.box("ink", 0.29, 0.445, 0.71, 0.485)          # bigode
        c.poly("ink", [(0.25, 0.46), (0.75, 0.46), (0.63, 0.62), (0.37, 0.62)])
        c.hline("skin", 0.42, 0.58, 0.505)              # a boca aberta na barba
        for fx in (0.36, 0.44, 0.56, 0.64):             # fios da barba
            c.vline("skin_sh", fx, 0.53, 0.60, t=1)
    elif rank == "j":
        c.box("ink", 0.335, 0.455, 0.665, 0.478)        # bigode fino
        c.hline("ink", 0.43, 0.57, 0.505)
    else:
        c.hline("ink", 0.425, 0.575, 0.475)
        c.hline("robe", 0.44, 0.56, 0.492, t=1)         # labio


def _crown_king(c):
    """Tres pontas altas com perola, sobre a banda de pedras."""
    for fx in (0.30, 0.50, 0.70):
        c.tri("gold", fx, 0.025, 0.145, 0.085)
        c.disc("white", fx, 0.035, 0.028)
        c.box("robe", fx - 0.025, 0.075, fx + 0.025, 0.11)
    c.box("gold", 0.14, 0.12, 0.86, 0.205)
    for i, fx in enumerate((0.22, 0.36, 0.50, 0.64, 0.78)):
        c.disc("ink", fx, 0.163, 0.042)
        c.disc("robe" if i % 2 == 0 else "white", fx, 0.163, 0.03)
    c.hline("gold_sh", 0.14, 0.86, 0.193)
    c.hline("ink", 0.14, 0.86, 0.205)


def _crown_queen(c):
    """Coroa baixa de perolas. A dama se separa do rei pelo cabelo comprido e
    pela ausencia de barba, nao pela coroa -- entao a coroa dela e a discreta."""
    for fx in (0.32, 0.50, 0.68):
        c.tri("gold", fx, 0.05, 0.135, 0.055)
        c.disc("white", fx, 0.058, 0.022)
    c.box("gold", 0.19, 0.115, 0.81, 0.185)
    for i, fx in enumerate((0.27, 0.385, 0.50, 0.615, 0.73)):
        c.disc("ink", fx, 0.152, 0.033)
        c.disc("robe" if i % 2 == 0 else "white", fx, 0.152, 0.022)
    c.hline("gold_sh", 0.19, 0.81, 0.175)
    c.hline("ink", 0.19, 0.81, 0.185)


def _hat_jack(c):
    """Barrete de aba com dobra e debrum. A pena vem depois do espelho."""
    c.rrect("robe", 0.21, 0.015, 0.79, 0.135, 0.09)
    c.rrect("robe_sh", 0.21, 0.015, 0.43, 0.135, 0.09)
    c.vline("ink", 0.43, 0.02, 0.13, t=1)
    c.disc("gold", 0.31, 0.075, 0.035)
    c.box("gold", 0.14, 0.125, 0.86, 0.205)
    c.hline("robe", 0.19, 0.81, 0.15)
    c.hline("gold_sh", 0.14, 0.86, 0.193)
    c.hline("ink", 0.14, 0.86, 0.205)


# ---------------------------------------------------------------- overlays --
# Aplicados depois do espelho. E o que a carta de referencia tem de
# assimetrico; sem isto a figura fica simetrica dos dois lados e le como totem.


_SCEPTRE_HEAD = {
    "k": [                       # cruz sobre o orbe
        "..KGK..",
        "..KGK..",
        "KKGGGKK",
        "..KGK..",
        ".KGGGK.",
        "KGGgGGK",
        ".KGGGK.",
    ],
    "q": [                       # flor de lis
        "..KGK..",
        ".KGGGK.",
        "KGKGKGK",
        "KGGGGGK",
        ".KGGGK.",
        "..KGK..",
        "..KGK..",
    ],
    "j": [                       # lamina de alabarda
        "...KK..",
        "..KWWK.",
        ".KWWWK.",
        "KWWWK..",
        "KWWK...",
        ".KK....",
        "..K....",
    ],
}


def _sceptre(c, rank):
    """Haste em diagonal, atravessada pela mao, com a cabeca propria de cada
    figura -- e o unico lugar onde J, Q e K carregam objetos diferentes."""
    c.line("ink", 0.21, 0.50, 0.09, 0.985, t=c.s + 2)
    c.line("gold", 0.21, 0.50, 0.09, 0.985, t=c.s)
    c.sprite(_SCEPTRE_HEAD[rank], 0.155, 0.395)
    c.sprite(HAND, 0.135, 0.665)


def _feather(c):
    """A pena do valete. Fora do espelho, de proposito: e a unica coisa que
    impede o valete de ler como um rei mais magro."""
    c.poly("ink", [(0.68, 0.135), (0.98, 0.00), (1.00, 0.05), (0.72, 0.17)])
    c.poly("white", [(0.70, 0.135), (0.965, 0.02), (0.975, 0.045), (0.73, 0.152)])
    c.line("gold", 0.72, 0.128, 0.95, 0.035, t=1)


def _sash(c):
    """Faixa diagonal atravessando o manto, do ombro direito para a base.

    Do lado oposto ao cetro de proposito: juntos do mesmo lado eles viram uma
    listra so, e a diagonal -- que e o que a carta de referencia tem de mais
    caracteristico -- se perde.
    """
    c.poly("ink", [(0.97, 0.775), (0.74, 0.655), (0.63, 0.655), (0.97, 0.885)])
    c.poly("gold", [(0.96, 0.795), (0.745, 0.672), (0.665, 0.672), (0.96, 0.865)])
    for i in range(2):
        c.disc("robe", 0.76 + i * 0.10, 0.735 + i * 0.05, 0.020)


# --------------------------------------------------------------- coringa ----
# O coringa nao segue a construcao das outras tres. Ele nao e uma meia-figura
# girada: e um bufao de corpo inteiro, de pe. Quem faz a carta continuar lendo
# dos dois lados e a legenda JOKER das bordas, que o gen_card estampa girada.

def _joker(c):
    """Bufao de corpo inteiro: gorro de tres pontas com guizos, rosto, rufo e
    gibao em losangos.

    A palavra JOKER nas bordas nao esta aqui: e mobilia da carta, como o indice
    de canto, e quem a estampa e o gen_card.
    """
    # gibao com padrao de losangos, alternando manto e ouro
    c.poly("robe", [(0.22, 0.50), (0.78, 0.50), (0.88, 0.62),
                    (0.88, 0.98), (0.12, 0.98), (0.12, 0.62)])
    for row in range(5):
        for col in range(4):
            fx = 0.22 + col * 0.185 + (0.0925 if row % 2 else 0)
            fy = 0.60 + row * 0.085
            if fx < 0.16 or fx > 0.84:
                continue
            c.poly("gold", [(fx, fy - 0.035), (fx + 0.09, fy),
                            (fx, fy + 0.035), (fx - 0.09, fy)])
    c.hline("gold", 0.12, 0.88, 0.735)
    c.hline("ink", 0.12, 0.88, 0.755)
    c.disc("gold", 0.50, 0.745, 0.05)
    c.disc("ink", 0.50, 0.745, 0.028)

    # rufo
    c.box("white", 0.16, 0.425, 0.84, 0.505)
    c.hline("ink", 0.16, 0.84, 0.425, t=1)
    for i in range(7):
        c.vline("ink", 0.20 + i * 0.10, 0.428, 0.502, t=1)
    c.hline("ink", 0.16, 0.84, 0.498, t=1)

    # rosto
    c.rrect("skin", 0.29, 0.215, 0.71, 0.43, 0.09)
    c.box("ink", 0.355, 0.275, 0.415, 0.31)
    c.box("ink", 0.585, 0.275, 0.645, 0.31)
    c.box("white", 0.365, 0.282, 0.385, 0.296)
    c.box("white", 0.595, 0.282, 0.615, 0.296)
    c.vline("skin_sh", 0.485, 0.315, 0.355)
    c.poly("ink", [(0.36, 0.375), (0.64, 0.375), (0.50, 0.415)])   # o sorriso
    c.hline("white", 0.40, 0.60, 0.383, t=1)
    c.disc("robe", 0.315, 0.345, 0.035)                            # bochechas
    c.disc("robe", 0.685, 0.345, 0.035)

    # Gorro de bufao: tres pontas nascendo do mesmo carrapito, cada uma com
    # guizo. As laterais caem para fora e para baixo -- de pe elas viram chifres.
    c.poly("robe", [(0.50, 0.135), (0.355, 0.235), (0.645, 0.235)])
    c.poly("gold", [(0.34, 0.235), (0.50, 0.165), (0.50, 0.20),
                    (0.20, 0.175), (0.15, 0.205), (0.13, 0.175)])
    c.poly("robe", [(0.66, 0.235), (0.50, 0.165), (0.50, 0.20),
                    (0.80, 0.175), (0.85, 0.205), (0.87, 0.175)])
    c.rrect("gold", 0.27, 0.222, 0.73, 0.252, 0.03)
    c.hline("ink", 0.26, 0.74, 0.250, t=1)
    for fx, fy in ((0.50, 0.115), (0.115, 0.185), (0.885, 0.185)):
        c.disc("ink", fx, fy, 0.06)
        c.disc("white", fx, fy, 0.042)
        c.disc("gold_sh", fx, fy, 0.018)


_HEADGEAR = {
    "k": _crown_king,
    "q": _crown_queen,
    "j": _hat_jack,
}


def half(rank, w=REF_W):
    """(mapa de papéis, largura, altura) da meia-figura, só a metade de cima."""
    assert rank != "joker", "o coringa é de corpo inteiro; use figure()"
    h = round(w * REF_H / REF_W)
    c = _Canvas(w, h)
    _robe(c)
    _hair(c, long_=(rank == "q"))
    _face(c, rank)
    _collar(c)   # depois do rosto: o cabelo desce ate a gola e a cobriria
    _HEADGEAR[rank](c)
    c.symmetrize()
    _sash(c)
    _sceptre(c, rank)
    if rank == "j":
        _feather(c)
    c.keyline()
    return c.pix, w, h


def figure(rank, w=REF_W):
    """(mapa de papéis, largura, altura) da figura inteira: a metade mais o
    giro de 180 graus -- não um reflexo vertical, que deixaria o cetro do mesmo
    lado nas duas metades e a carta pararia de ler como uma carta girada.

    O coringa é a exceção: figura única de corpo inteiro, sem giro.
    """
    if rank == "joker":
        h = 2 * round(w * REF_H / REF_W)
        c = _Canvas(w, h)
        _joker(c)
        c.keyline()
        return c.pix, w, h
    top, w, h = half(rank, w)
    out = dict(top)
    for (x, y), role in top.items():
        out[(w - 1 - x, 2 * h - 1 - y)] = role
    return out, w, 2 * h
