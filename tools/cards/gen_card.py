#!/usr/bin/env python3
"""Gerador de cartas pixel-art de baralho frances: 52 cartas, 2 coringas, verso.

Herda a construcao das cartas de UNO do nuo -- mesma moldura biselada, mesmo
rim, mesmo dither Bayer 2x2, mesmo grid de 64x96 -- e troca a face. O que muda
em relacao aquele gerador:

  corpo      rampa de papel no lugar das seis rampas coloridas de naipe, com o
             contraste baixo o bastante para ler como papel e nao como gradiente
  rim        fio de 2px na tinta do naipe (vermelho ou preto) no lugar do rim
             saturado -- e o que da leitura de cor instantanea num leque
  miolo      campo de pips (pips.PIP_LAYOUT), pip unico grande no as, ou figura
             espelhada (court.py) nas cartas de figura
  canto      rank sobre pip, o de baixo rotacionado 180 graus

Os pips vivem em pips.py, os ranks em glyphs.py, as figuras em court.py. Este
modulo desenha a carta e estampa as pecas nela.

Cada carta e um grid indexado de inteiros, emitido como:
  - .svg    retangulos maximais fundidos, um path por cor, arestas duras
  - .png    encoder em python puro, sem Pillow
  - .pixil  JSON do Pixilart, com o PNG embutido em base64

Recolorir e trocar PAPER/INK; o layout e agnostico de cor.
"""

import base64
import json
import os
import struct
import zlib
from pathlib import Path

import backs
import court
import glyphs
import pips

OUT_DIR = Path(os.environ.get(
    "FDP_CARDS_OUT", Path(__file__).resolve().parent / "out"
))

# ------------------------------------------------------------------ cores ---

NEUTRALS = {
    "EDGE": "#2A2126",
    "FRM_HI": "#FBF7EE",
    "FRM": "#F1EBDD",
    "FRM_SH": "#C4BCAA",
}

# Rampa do corpo, topo -> base. O passo entre tons e minusculo de proposito:
# num corpo claro qualquer degrau visivel le como sujeira, nao como papel.
PAPER = ["#FFFFFF", "#FDFBF7", "#FBF8F1", "#F8F4EA", "#F5F0E3", "#F2ECDC"]

# Sombra de 1px sob cada pip e sob cada figura. E o que da relevo de impressao
# a tinta chapada -- sem ela a carta fica plana ao lado das cartas de UNO.
PAPER_SH = "#D9D0BD"

INK = {"black": "#1B1215", "red": "#B3242A"}

# Paleta das figuras. E o unico lugar do baralho com mais de uma cor: o que faz
# uma figura ler como figura, e nao como silhueta, e o contraste entre coroa
# dourada, pele, manto e contorno preto. Indice e pips continuam na tinta do
# naipe, entao a carta segue lendo vermelho ou preto de longe.
COURT = {
    "ink": "#1B1215",
    "skin": "#F0C89A",
    "skin_sh": "#C99A6B",
    "gold": "#F5C842",
    "gold_sh": "#C08A18",
    "white": "#FFFFFF",
}

# O manto acompanha a cor do naipe: vermelho nos vermelhos, azul nos pretos.
# Preto seria a escolha obvia para espadas e paus, e e a errada -- o manto
# encostaria no contorno e a figura viraria uma mancha.
ROBE = {
    "red": ("#C0322F", "#8E1F26"),
    "black": ("#2E4A8A", "#1E3161"),
}

ROLE_NAMES = {
    "EDGE": "edge",
    "FRM_HI": "frame-hi",
    "FRM": "frame",
    "FRM_SH": "frame-shade",
    "INK": "ink",
    "PAPER_SH": "ink-shade",
}

# Paleta dos versos padronizados. E a mesma nos seis de proposito: sao versos do
# mesmo baralho, e quem troca de verso no meio da partida tem de continuar
# reconhecendo as cartas como do mesmo jogo.
BACK_PALETTE = {
    "cream": "#F1E3D3",
    "pink_l": "#DFAFC2",
    "pink": "#C4869E",
    "pink_d": "#9E6180",
}

# As cintas entre a borda do corpo e o campo padronizado: (espessura, papel).
# Duas cintas com uma folga creme entre elas -- uma so deixa a trama encostando
# na moldura, e a carta perde a moldura.
BACK_BANDS = ((3, "pink"), (3, "cream"), (2, "pink_d"))

# ------------------------------------------------------------------- grid ---


class Grid:
    """Buffer de pixels indexado. O indice 0 e sempre transparente."""

    def __init__(self, w, h):
        self.w = w
        self.h = h
        self.px = [[0] * w for _ in range(h)]
        self.palette = ["#00000000"]
        self._idx = {"#00000000": 0}
        self.roles = {}  # hex -> nome semantico, para o CSS enderecar cada parte

    def color(self, hexstr):
        if hexstr not in self._idx:
            self._idx[hexstr] = len(self.palette)
            self.palette.append(hexstr)
        return self._idx[hexstr]

    def set(self, x, y, ci):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = ci

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return 0


def compact(g):
    """Descarta cores que a arte nunca usou; mantem transparente no indice 0."""
    used = {g.px[y][x] for y in range(g.h) for x in range(g.w)}
    order = [0] + sorted(used - {0})
    remap = {old: i for i, old in enumerate(order)}
    out = Grid(g.w, g.h)
    out.roles = dict(g.roles)  # indexado por hex, entao reindexar nao importa
    out.palette = [g.palette[i] for i in order]
    out._idx = {c: i for i, c in enumerate(out.palette)}
    for y in range(g.h):
        for x in range(g.w):
            out.px[y][x] = remap[g.px[y][x]]
    return out


def rgba(hexstr):
    s = hexstr.lstrip("#")
    if len(s) == 8:
        return tuple(int(s[i : i + 2], 16) for i in (0, 2, 4, 6))
    return tuple(int(s[i : i + 2], 16) for i in (0, 2, 4)) + (255,)


# -------------------------------------------------------------- primitivas --


def in_rounded_rect(x, y, x0, y0, x1, y1, r):
    """True se (x,y) esta dentro do retangulo arredondado [x0,x1]x[y0,y1]."""
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    if r <= 0:
        return True
    cx = x0 + r if x < x0 + r else (x1 - r if x > x1 - r else x)
    cy = y0 + r if y < y0 + r else (y1 - r if y > y1 - r else y)
    if cx == x or cy == y:
        return True
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r + r * 0.35


def fill_rounded_rect(g, x0, y0, x1, y1, r, ci):
    for y in range(max(0, y0), min(g.h, y1 + 1)):
        for x in range(max(0, x0), min(g.w, x1 + 1)):
            if in_rounded_rect(x, y, x0, y0, x1, y1, r):
                g.set(x, y, ci)


BAYER2 = [[0.0, 0.5], [0.75, 0.25]]


def ramp_index(t, n, x, y, dither):
    """Mapeia t em [0,1] para um indice da rampa, com dither ordenado."""
    f = t * (n - 1)
    i = int(f)
    if i >= n - 1:
        return n - 1
    if not dither:
        return i if (f - i) < 0.5 else i + 1
    return i + 1 if (f - i) > BAYER2[y % 2][x % 2] else i


def stamp_ink(g, pts, ox, oy, ci_ink, ci_shade, shade=True):
    """Estampa tinta chapada com um relevo de 1px em baixo e a direita.

    Sem outline, ao contrario do gerador de UNO: la o glyph era branco sobre
    cor e precisava de um contorno preto para nao sumir; aqui e tinta sobre
    papel, e um contorno so engrossaria o desenho.
    """
    if shade:
        for x, y in pts:
            if (x - 1, y - 1) not in pts:
                continue
            g.set(ox + x + 1, oy + y + 1, ci_shade)
        for x, y in pts:
            if (x + 1, y + 1) not in pts:
                g.set(ox + x + 1, oy + y + 1, ci_shade)
    for x, y in pts:
        g.set(ox + x, oy + y, ci_ink)


def rot180(pts, w, h):
    return {(w - 1 - x, h - 1 - y) for x, y in pts}


# ------------------------------------------------------------------ layout --
# Todas as medidas sao do grid de 64x96 com k=2, derivadas em _geometry() para
# nao existirem duas verdades sobre onde a borda interna cai.

K = 4
CARD_W, CARD_H = 32 * K, 48 * K
BORDER = 2 * K
R_OUT = 4 * K
R_IN = R_OUT - BORDER   # raio da borda interna do corpo

ACE_PIP_W = round(9.5 * K)   # o pip do as; os outros dois vem de pips.py
OUTLINE = K // 2             # fio escuro no contorno da carta
COURT_W = 62            # largura da figura; ver COURT_INSET

RANKS = ["a", 2, 3, 4, 5, 6, 7, 8, 9, 10, "j", "q", "k"]
COURT_RANKS = ("j", "q", "k")

# 3, nao 2: o relevo de 1px do indice inferior direito e desenhado deslocado
# para baixo e para a direita, e com inset 2 ele cai fora do canto arredondado
# do corpo, sobre o fio. Pego por test_estampas_nao_escapam_do_corpo.
# 4: com 5 ou mais, a coluna do indice do Q (o rank mais largo das figuras)
# avanca sobre a figura. Com 3, o relevo de 1px do indice inferior direito cai
# fora do canto arredondado do corpo. Pego por test_estampas_nao_escapam_do_corpo.
INDEX_INSET = 4   # do canto do corpo ate o bloco de indice
INDEX_GAP = 3     # entre a caixa do rank e o pip do indice
# As colunas laterais de pips ficam para dentro do indice, nao alinhadas com
# ele: encostadas na borda do corpo elas abrem um vazio no meio da carta, que e
# o oposto do que um 8 ou um 10 de baralho parecem.
FIELD_INSET = 21  # do lado do corpo ate a coluna de pips mais externa
FIELD_CLEAR = 5   # entre o bloco de indice e o campo de pips
COURT_INSET = 4   # do topo do corpo ate a figura


def _geometry():
    """(ix0, iy0, ix1, iy1) do corpo, e a altura reservada ao indice.

    A altura do indice e fixa: vem da caixa nominal do rank (nao da altura do
    glyph, senao a cauda do Q empurraria o pip para baixo so nas damas) e do
    maior pip de canto do baralho (nao o do naipe da carta, senao o campo de
    pips subiria e desceria entre naipes).
    """
    cx1, cy1 = CARD_W - 1, CARD_H - 1
    ix0, iy0, ix1, iy1 = BORDER, BORDER, cx1 - BORDER, cy1 - BORDER
    pip_h = max(pips.corner(s)[2] for s in pips.SUITS)
    return (ix0, iy0, ix1, iy1), glyphs.RANK_BOX_H + INDEX_GAP + pip_h


BODY, INDEX_H = _geometry()


def _index_block(suit, rank):
    """(pontos, largura, altura) do bloco de canto: rank sobre pip, centrados."""
    rk, rw, rh = glyphs.rank(rank)
    pp, pw, ph = pips.corner(suit)
    w = max(rw, pw)
    # O pip pende da caixa nominal, nao da altura do glyph: a cauda do Q desce
    # 2px abaixo da caixa e cai dentro do INDEX_GAP, sem mexer no pip.
    top = glyphs.RANK_BOX_H + INDEX_GAP
    pts = {(x + (w - rw) // 2, y) for x, y in rk}
    pts |= {(x + (w - pw) // 2, y + top) for x, y in pp}
    return pts, w, max(rh, top + ph)


def _stamp_indices(g, suit, rank, c_ink, c_sh):
    ix0, iy0, ix1, iy1 = BODY
    block, w, h = _index_block(suit, rank)
    stamp_ink(g, block, ix0 + INDEX_INSET, iy0 + INDEX_INSET, c_ink, c_sh)
    stamp_ink(
        g, rot180(block, w, h),
        ix1 - INDEX_INSET - w + 1, iy1 - INDEX_INSET - h + 1, c_ink, c_sh,
    )


def _stamp_field(g, suit, rank, c_ink, c_sh):
    """Distribui os pips do rank pelo campo, invertendo os da metade de baixo."""
    ix0, iy0, ix1, iy1 = BODY
    pp, pw, ph = pips.field(suit)
    fx0, fx1 = ix0 + FIELD_INSET, ix1 - FIELD_INSET
    fy0 = iy0 + INDEX_INSET + INDEX_H + FIELD_CLEAR
    fy1 = iy1 - INDEX_INSET - INDEX_H - FIELD_CLEAR
    span_x, span_y = fx1 - fx0 + 1 - pw, fy1 - fy0 + 1 - ph
    assert span_x >= 0 and span_y >= 0, "o campo de pips nao cabe no corpo"
    for col, t in pips.PIP_LAYOUT[rank]:
        p = rot180(pp, pw, ph) if t > 0.5 else pp
        stamp_ink(
            g, p,
            fx0 + round(col * span_x), fy0 + round(t * span_y), c_ink, c_sh,
        )


def _stamp_ace(g, suit, c_ink, c_sh):
    """Pip unico, centrado no cartao -- nao no campo, que e assimetrico por
    causa das alturas diferentes de pip entre naipes."""
    pp, pw, ph = pips.ace(suit, ACE_PIP_W)
    stamp_ink(g, pp, (CARD_W - pw) // 2, (CARD_H - ph) // 2, c_ink, c_sh)


def _court_palette(g, ink_name):
    """Resolve os papeis de cor de court.py para indices da paleta da carta."""
    pal = {role: g.color(hexv) for role, hexv in COURT.items()}
    robe, robe_sh = ROBE[ink_name]
    pal["robe"] = g.color(robe)
    pal["robe_sh"] = g.color(robe_sh)
    for role, idx in pal.items():
        g.roles.setdefault(g.palette[idx], f"court-{role.replace('_', '-')}")
    assert set(pal) == set(court.ROLES), (
        f"papeis fora de sincronia com court.ROLES: "
        f"{set(pal) ^ set(court.ROLES)}"
    )
    return pal


def _stamp_court(g, rank, pal):
    """Figura girada 180 graus, pintada papel a papel."""
    ix0, iy0, ix1, iy1 = BODY
    fig, w, h = court.figure(rank, COURT_W)
    ox = (CARD_W - w) // 2
    oy = iy0 + COURT_INSET
    assert oy + h - 1 <= iy1 - COURT_INSET, "a figura nao cabe no corpo"
    for (x, y), role in fig.items():
        g.set(ox + x, oy + y, pal[role])


# ------------------------------------------------------------- construtores -


def _frame(g, C):
    """Fio escuro no contorno, depois a moldura biselada por dentro.

    O fio e neutro, nao na cor do naipe -- a borda colorida foi removida por
    comer largura do corpo. Sem fio nenhum, porem, a carta perde a silhueta
    sobre fundo claro: moldura creme e corpo de papel sao quase a mesma cor, e
    o unico contraste sobrava para o bisel de 1px do canto inferior direito.
    """
    cx1, cy1 = CARD_W - 1, CARD_H - 1
    hi = max(1, K // 2)
    o = OUTLINE
    fill_rounded_rect(g, 0, 0, cx1, cy1, R_OUT, C["EDGE"])
    fill_rounded_rect(g, o, o, cx1 - o, cy1 - o, R_OUT - o, C["FRM_SH"])
    fill_rounded_rect(g, o, o, cx1 - o - K, cy1 - o - K, R_OUT - o, C["FRM"])
    fill_rounded_rect(g, o, o, cx1 - o - K, cy1 - o - K, R_OUT - o, C["FRM_HI"])
    fill_rounded_rect(g, o + hi, o + hi, cx1 - o - K, cy1 - o - K, R_OUT - o, C["FRM"])


def _body(g, ramp):
    """Corpo com gradiente vertical e dither. Devolve os pixels que pintou."""
    ix0, iy0, ix1, iy1 = BODY
    painted = set()
    for y in range(iy0, iy1 + 1):
        t = (y - iy0) / max(1, (iy1 - iy0))
        for x in range(ix0, ix1 + 1):
            if in_rounded_rect(x, y, ix0, iy0, ix1, iy1, R_IN):
                g.set(x, y, ramp[ramp_index(t, len(ramp), x, y, True)])
                painted.add((x, y))
    return painted


def _base(g, C):
    """Moldura mais corpo de papel. Comum a toda carta de face.

    Nao ha fio interno. Ele existia na cor do naipe, e foi removido a pedido:
    comia 8px de cada eixo do corpo -- que e o recurso escasso da carta -- e a
    leitura de cor num leque ja vem da tinta dos pips. Se a silhueta da carta
    precisar de mais definicao sobre fundo claro, a resposta e um fio neutro de
    1px, nao a volta do fio colorido.
    """
    _frame(g, C)
    _body(g, C["PAPER"])


def _palette(g, ink_name):
    C = {name: g.color(v) for name, v in NEUTRALS.items()}
    C["INK"] = g.color(INK[ink_name])
    C["PAPER_SH"] = g.color(PAPER_SH)
    C["PAPER"] = [g.color(c) for c in PAPER]
    for name in ("EDGE", "FRM_HI", "FRM", "FRM_SH", "INK", "PAPER_SH"):
        g.roles[g.palette[C[name]]] = ROLE_NAMES[name]
    for i, idx in enumerate(C["PAPER"]):
        g.roles.setdefault(g.palette[idx], f"paper-{i}")
    return C


def build_card(suit, rank):
    """Uma das 52. suit em pips.SUITS, rank em RANKS."""
    g = Grid(CARD_W, CARD_H)
    ink_name = "red" if suit in pips.RED_SUITS else "black"
    C = _palette(g, ink_name)
    _base(g, C)
    _stamp_indices(g, suit, rank, C["INK"], C["PAPER_SH"])
    if rank == "a":
        _stamp_ace(g, suit, C["INK"], C["PAPER_SH"])
    elif rank in COURT_RANKS:
        _stamp_court(g, rank, _court_palette(g, ink_name))
    else:
        _stamp_field(g, suit, rank, C["INK"], C["PAPER_SH"])
    return g


JOKER_LABEL_SCALE = 2
JOKER_LABEL_BOLD = 1    # px a mais na haste; ver glyphs.label
JOKER_LABEL_INSET = 3   # da borda do corpo ate a legenda
# Ao longo da borda: 3 nao serve porque a ponta da palavra cai no canto
# arredondado do corpo. Pego por test_coringa_tambem_cabe_no_corpo.
JOKER_LABEL_MARGIN = 6  # da ponta do corpo ate a ponta da palavra


def _stamp_joker_label(g, c_ink):
    """JOKER em pe nas duas bordas: em cima a esquerda, embaixo a direita.

    A segunda e girada 180 graus, nao espelhada -- espelhada a palavra sairia
    ao contrario. E o mesmo truque do indice de canto, e e o que faz a carta
    ler igual de cabeca para baixo sem duplicar o bufao: girada, a legenda de
    cima a esquerda cai exatamente em cima da de baixo a direita.
    """
    ix0, iy0, ix1, iy1 = BODY
    pts, ww, wh = glyphs.label("JOKER", JOKER_LABEL_SCALE, JOKER_LABEL_BOLD)
    top = iy0 + JOKER_LABEL_MARGIN
    bottom = iy1 - JOKER_LABEL_MARGIN - ww + 1
    left = ix0 + JOKER_LABEL_INSET
    right = ix1 - JOKER_LABEL_INSET - wh + 1
    for x, y in pts:
        g.set(left + y, top + (ww - 1 - x), c_ink)        # em cima, lendo de baixo
        g.set(right + (wh - 1 - y), bottom + x, c_ink)    # embaixo, girada 180


def build_joker(ink_name):
    """Coringa. Sem naipe e sem indice de canto: no lugar dele, a legenda."""
    g = Grid(CARD_W, CARD_H)
    C = _palette(g, ink_name)
    _base(g, C)
    _stamp_court(g, "joker", _court_palette(g, ink_name))
    _stamp_joker_label(g, C["INK"])
    return g


def _back_palette(g):
    pal = {role: g.color(hexv) for role, hexv in BACK_PALETTE.items()}
    for role, idx in pal.items():
        g.roles.setdefault(g.palette[idx], f"back-{role.replace('_', '-')}")
    assert set(pal) == set(backs.ROLES), (
        f"papeis fora de sincronia com backs.ROLES: {set(pal) ^ set(backs.ROLES)}"
    )
    return pal


def _back_field():
    """(x0, y0, largura, altura) do campo padronizado, dentro das cintas."""
    ix0, iy0, ix1, iy1 = BODY
    inset = sum(t for t, _ in BACK_BANDS)
    return ix0 + inset, iy0 + inset, ix1 - ix0 + 1 - 2 * inset, iy1 - iy0 + 1 - 2 * inset


def build_pattern_back(name):
    """Um dos versos padronizados: moldura, cintas e a trama de backs.py."""
    g = Grid(CARD_W, CARD_H)
    C = _palette(g, "black")
    pal = _back_palette(g)
    _frame(g, C)

    ix0, iy0, ix1, iy1 = BODY
    fill_rounded_rect(g, ix0, iy0, ix1, iy1, R_IN, pal["cream"])
    x0, y0, x1, y1, r = ix0, iy0, ix1, iy1, R_IN
    for thick, role in BACK_BANDS:
        fill_rounded_rect(g, x0, y0, x1, y1, r, pal[role])
        x0, y0, x1, y1 = x0 + thick, y0 + thick, x1 - thick, y1 - thick
        r = max(0, r - thick)
        fill_rounded_rect(g, x0, y0, x1, y1, r, pal["cream"])

    fx, fy, fw, fh = _back_field()
    for (x, y), role in backs.BACKS[name](fw, fh).items():
        g.set(fx + x, fy + y, pal[role])
    return g


# ---------------------------------------------------------------- writers ---


def merge_rects(g):
    """Decomposicao gulosa do grid em retangulos maximais.

    Um <rect> por pixel deixa milhares de arestas compartilhadas; sob um
    transform CSS fracionario cada uma encaixa por conta propria e aparecem
    costuras de um fio. Fundir em retangulos grandes e disjuntos (e depois um
    path por cor) elimina quase toda aresta interna e encolhe o arquivo em uma
    ordem de grandeza.
    """
    done = [[False] * g.w for _ in range(g.h)]
    out = []
    for y in range(g.h):
        for x in range(g.w):
            if done[y][x]:
                continue
            ci = g.px[y][x]
            if ci == 0:
                done[y][x] = True
                continue
            w = 1
            while x + w < g.w and not done[y][x + w] and g.px[y][x + w] == ci:
                w += 1
            h = 1
            while y + h < g.h and all(
                not done[y + h][xx] and g.px[y + h][xx] == ci
                for xx in range(x, x + w)
            ):
                h += 1
            for yy in range(y, y + h):
                for xx in range(x, x + w):
                    done[yy][xx] = True
            out.append((ci, x, y, w, h))
    return out


def write_svg(g, path, name):
    """Um <path> por cor, cada um com uma classe semantica.

    Sem width/height: o viewBox e exatamente a carta, entao o CSS e dono do
    tamanho e o transform-origin cai no centro real -- que e o que um leque e um
    hover precisam.
    """
    rects = merge_rects(g)
    by_color = {}
    for ci, x, y, w, h in rects:
        by_color.setdefault(ci, []).append((x, y, w, h))

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {g.w} {g.h}" '
        f'shape-rendering="crispEdges" role="img" aria-label="{name}">',
        f"<title>{name}</title>",
    ]
    for ci in sorted(by_color):
        hexc = g.palette[ci]
        role = g.roles.get(hexc, f"c{ci}")
        d = "".join(f"M{x} {y}h{w}v{h}h{-w}z" for x, y, w, h in by_color[ci])
        parts.append(f'<path class="f-{role}" fill="{hexc}" d="{d}"/>')
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")
    return len(rects), len(by_color)


def png_bytes(g):
    pal = [rgba(c) for c in g.palette]
    raw = bytearray()
    for y in range(g.h):
        raw.append(0)  # filtro tipo 0
        for x in range(g.w):
            raw.extend(pal[g.px[y][x]])

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", g.w, g.h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def write_pixil(g, path, name, png):
    doc = {
        "app": "pixilart",
        "version": "1.0",
        "name": name,
        "width": g.w,
        "height": g.h,
        "frames": [
            {
                "index": 0,
                "name": "Frame 1",
                "delay": 100,
                "hidden": False,
                "layers": [
                    {
                        "index": 0,
                        "name": "Layer 1",
                        "opacity": 100,
                        "hidden": False,
                        "locked": False,
                        "blend": "normal",
                        "src": "data:image/png;base64,"
                        + base64.b64encode(png).decode("ascii"),
                    }
                ],
            }
        ],
        "palette": [c for c in g.palette if c != "#00000000"],
    }
    path.write_text(json.dumps(doc), encoding="utf-8")


# -------------------------------------------------------------------- main --


def all_cards():
    """(stem, nome, grid) das 54 cartas mais o verso, na ordem do baralho."""
    for suit in pips.SUITS:
        for rank in RANKS:
            yield f"fdp-{suit}-{rank}", f"FDP {suit} {rank}", build_card(suit, rank)
    for ink in ("red", "black"):
        yield f"fdp-joker-{ink}", f"FDP joker {ink}", build_joker(ink)
    for name in backs.BACKS:
        yield f"fdp-back-{name}", f"FDP verso {name}", build_pattern_back(name)


if __name__ == "__main__":
    EMIT_PNG = os.environ.get("FDP_CARDS_PNG") == "1"
    EMIT_PIXIL = os.environ.get("FDP_CARDS_PIXIL") == "1"

    svg_dir = OUT_DIR / "svg"
    svg_dir.mkdir(parents=True, exist_ok=True)
    png_dir = OUT_DIR / "png"
    if EMIT_PNG:
        png_dir.mkdir(parents=True, exist_ok=True)
    pixil_dir = OUT_DIR / "pixil"
    if EMIT_PIXIL:
        pixil_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    line = []
    for stem, name, g in all_cards():
        g = compact(g)
        rects, _ = write_svg(g, svg_dir / f"{stem}.svg", name)
        if EMIT_PNG or EMIT_PIXIL:
            png = png_bytes(g)
            if EMIT_PNG:
                (png_dir / f"{stem}.png").write_bytes(png)
            if EMIT_PIXIL:
                write_pixil(g, pixil_dir / f"{stem}.pixil", name, png)
        line.append(f"{stem.split('-', 1)[1]}:{rects}r")
        total += 1
        if len(line) == 13:
            print("  ".join(line))
            line = []
    if line:
        print("  ".join(line))
    print(f"\n{total} cartas -> {svg_dir}/")
