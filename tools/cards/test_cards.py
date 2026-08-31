#!/usr/bin/env python3
"""Invariantes do baralho. Roda sem dependencia nenhuma:

    python3 test_cards.py

Nao testa se a arte esta bonita -- isso e o demo.html. Testa o que da para
errar em silencio: tinta invadindo a moldura, o campo de pips desenhando um
numero de pips diferente do rank, o indice colidindo com o miolo, e SVG mal
formado. Todos sao coisas que passariam despercebidas num contact sheet e
apareceriam so no jogo.
"""

import sys
import xml.etree.ElementTree as ET
from io import StringIO

import court
import backs
import gen_card as G
import glyphs
import pips


def ink_pixels(g, hexcolor):
    """Posicoes cuja cor e exatamente `hexcolor`."""
    idx = g._idx.get(hexcolor)
    if idx is None:
        return set()
    return {
        (x, y)
        for y in range(g.h)
        for x in range(g.w)
        if g.px[y][x] == idx
    }


def test_estampas_nao_escapam_do_corpo():
    """Nenhum pixel estampado pode cair sobre a moldura ou o fio.

    Testado estampando numa grade vazia, nao lendo a carta pronta: o fio interno
    e desenhado com a mesma tinta do naipe, entao procurar "tinta fora do corpo"
    na carta montada acha o proprio fio. O que importa e onde as estampas caem.

    E o erro que passaria batido: o desenho encosta na borda, a carta continua
    parecendo certa num contact sheet, e so no leque -- com as cartas
    sobrepostas -- a borda quebrada aparece.
    """
    ix0, iy0, ix1, iy1 = G.BODY
    r = G.R_IN
    for suit in pips.SUITS:
        ink_name = "red" if suit in pips.RED_SUITS else "black"
        for rank in G.RANKS:
            g = G.Grid(G.CARD_W, G.CARD_H)
            C = G._palette(g, ink_name)
            G._stamp_indices(g, suit, rank, C["INK"], C["PAPER_SH"])
            if rank == "a":
                G._stamp_ace(g, suit, C["INK"], C["PAPER_SH"])
            elif rank in G.COURT_RANKS:
                G._stamp_court(g, rank, G._court_palette(g, ink_name))
            else:
                G._stamp_field(g, suit, rank, C["INK"], C["PAPER_SH"])
            for y in range(g.h):
                for x in range(g.w):
                    if g.px[y][x] == 0:
                        continue
                    assert G.in_rounded_rect(x, y, ix0, iy0, ix1, iy1, r), (
                        f"{suit}-{rank}: estampa em ({x},{y}), fora do corpo"
                    )


def test_coringa_tambem_cabe_no_corpo():
    """Figura e legenda -- a legenda encosta nas bordas do corpo, entao e a que
    tem mais chance de escapar pelo canto arredondado."""
    ix0, iy0, ix1, iy1 = G.BODY
    r = G.R_IN
    for ink_name in ("red", "black"):
        g = G.Grid(G.CARD_W, G.CARD_H)
        C = G._palette(g, ink_name)
        G._stamp_court(g, "joker", G._court_palette(g, ink_name))
        G._stamp_joker_label(g, C["INK"])
        for y in range(g.h):
            for x in range(g.w):
                if g.px[y][x]:
                    assert G.in_rounded_rect(x, y, ix0, iy0, ix1, iy1, r), (
                        f"coringa {ink_name}: estampa em ({x},{y})"
                    )


def test_a_legenda_do_coringa_nao_encosta_na_figura():
    """A legenda corre pelas bordas e o bufao ocupa o meio. Se a figura crescer
    ou a fonte subir de escala, eles se atropelam."""
    ix0, iy0, ix1, iy1 = G.BODY
    _, ww, wh = glyphs.label("JOKER", G.JOKER_LABEL_SCALE, G.JOKER_LABEL_BOLD)
    fim = ix0 + G.JOKER_LABEL_INSET + wh - 1
    fig_x0 = (G.CARD_W - G.COURT_W) // 2
    assert fim < fig_x0, f"legenda termina em x{fim}, figura comeca em x{fig_x0}"
    assert 2 * ww + 2 * G.JOKER_LABEL_MARGIN <= iy1 - iy0 + 1, (
        "as duas legendas nao cabem uma acima da outra na borda"
    )


def test_campo_desenha_a_quantidade_certa_de_pips():
    """A area de tinta do campo tem de ser exatamente n vezes a area do pip.

    Se dois pips se sobrepusessem -- que e o que acontece quando o layout nao
    cabe -- a area viria menor, e a carta mostraria menos pips do que o rank diz.
    """
    for suit in pips.SUITS:
        ink = G.INK["red" if suit in pips.RED_SUITS else "black"]
        area = len(pips.field(suit)[0])
        for rank, layout in pips.PIP_LAYOUT.items():
            g = G.Grid(G.CARD_W, G.CARD_H)
            C = G._palette(g, "red" if suit in pips.RED_SUITS else "black")
            G._stamp_field(g, suit, rank, C["INK"], C["PAPER_SH"])
            got = len(ink_pixels(g, ink))
            assert got == area * len(layout), (
                f"{suit}-{rank}: {got} px de tinta, esperado "
                f"{area * len(layout)} ({len(layout)} pips de {area} px)"
            )


def test_o_campo_cabe_nas_quatro_fileiras():
    """O 9 e o 10 empilham quatro fileiras de pips. Se o bloco de indice crescer
    a ponto de o campo nao comportar 4*altura_do_pip, os pips se sobrepoem --
    e a carta mostra menos pips do que o rank diz."""
    ix0, iy0, ix1, iy1 = G.BODY
    campo = ((iy1 - G.INDEX_INSET - G.INDEX_H - G.FIELD_CLEAR)
             - (iy0 + G.INDEX_INSET + G.INDEX_H + G.FIELD_CLEAR) + 1)
    for suit in pips.SUITS:
        ph = pips.field(suit)[2]
        assert campo >= 4 * ph, (
            f"{suit}: campo de {campo}px para quatro fileiras de {ph}px"
        )


def test_indice_nao_encosta_no_miolo():
    """Tem de sobrar pelo menos uma linha de papel entre o indice e o campo."""
    ix0, iy0, ix1, iy1 = G.BODY
    fy0 = iy0 + G.INDEX_INSET + G.INDEX_H + G.FIELD_CLEAR
    for suit in pips.SUITS:
        for rank in G.RANKS:
            _, _, h = G._index_block(suit, rank)
            bottom = iy0 + G.INDEX_INSET + h - 1
            assert bottom < fy0, (
                f"{suit}-{rank}: indice termina em {bottom}, campo comeca em {fy0}"
            )


def test_todo_rank_tem_indice_que_cabe_na_coluna():
    ix0, iy0, ix1, iy1 = G.BODY
    for suit in pips.SUITS:
        for rank in G.RANKS:
            _, w, h = G._index_block(suit, rank)
            assert ix0 + G.INDEX_INSET + w - 1 <= ix1 - G.INDEX_INSET, (
                f"{suit}-{rank}: bloco de {w} px nao cabe na largura do corpo"
            )
            assert h <= G.INDEX_H, (
                f"{suit}-{rank}: bloco de {h} px estoura INDEX_H={G.INDEX_H}"
            )


def test_figuras_sao_espelhadas():
    """A metade de baixo tem de ser a de cima girada 180 graus, nao refletida.

    Comparando tambem o papel de cor: um giro que trocasse a cor de lugar
    passaria por uma comparacao so de posicoes.
    """
    for rank in G.COURT_RANKS:
        pix, w, h = court.figure(rank, G.COURT_W)
        top = {p: r for p, r in pix.items() if p[1] < h // 2}
        bottom = {p: r for p, r in pix.items() if p[1] >= h // 2}
        assert bottom == {
            (w - 1 - x, h - 1 - y): r for (x, y), r in top.items()
        }, rank


def test_o_coringa_e_de_corpo_inteiro():
    """O coringa e a excecao: bufao de pe, nao meia-figura girada. Quem faz a
    carta ler dos dois lados e a legenda das bordas, nao o desenho."""
    pix, w, h = court.figure("joker", G.COURT_W)
    girado = {(w - 1 - x, h - 1 - y): r for (x, y), r in pix.items()}
    assert pix != girado, "o coringa virou simetrico por rotacao"
    try:
        court.half("joker")
    except AssertionError:
        pass
    else:
        raise AssertionError("court.half aceitou o coringa")


def test_os_papeis_de_cor_das_figuras_estao_todos_declarados():
    """court.ROLES e o contrato com gen_card. Um papel novo no desenho que nao
    entre na lista sai como KeyError na hora de pintar -- este teste pega antes."""
    for rank in G.COURT_RANKS + ("joker",):
        pix, _, _ = court.figure(rank, G.COURT_W)
        extra = set(pix.values()) - set(court.ROLES)
        assert not extra, f"{rank}: papeis fora de ROLES: {extra}"


def test_o_indice_das_figuras_nao_invade_a_figura():
    """A coluna do indice e a figura dividem a largura do corpo. O Q e o rank
    mais largo das figuras; se ele crescer, encosta no desenho."""
    ix0, iy0, ix1, iy1 = G.BODY
    fig_x0 = (G.CARD_W - G.COURT_W) // 2
    for rank in G.COURT_RANKS:
        for suit in pips.SUITS:
            _, w, _ = G._index_block(suit, rank)
            fim = ix0 + G.INDEX_INSET + w - 1
            assert fim < fig_x0, (
                f"{suit}-{rank}: indice termina em x{fim}, figura comeca em x{fig_x0}"
            )


def test_o_valete_e_assimetrico():
    """A pena e o unico traco que separa o valete de um rei magro. Se alguem
    reescrever o chapeu dentro da simetrizacao, ela some -- e este teste quebra."""
    pix, w, h = court.half("j")
    mirrored = {(w - 1 - x, y): r for (x, y), r in pix.items()}
    assert pix != mirrored, "o valete virou simetrico -- a pena sumiu"


def test_ranks_cobrem_o_baralho_frances():
    assert G.RANKS == ["a", 2, 3, 4, 5, 6, 7, 8, 9, 10, "j", "q", "k"]
    assert set(pips.PIP_LAYOUT) == {2, 3, 4, 5, 6, 7, 8, 9, 10}
    for rank, layout in pips.PIP_LAYOUT.items():
        assert len(layout) == rank, f"{rank} tem {len(layout)} pips"
    for rank in G.RANKS:
        glyphs.rank(rank)  # levanta se faltar glyph


def test_o_baralho_tem_62_cartas_unicas():
    """52 cartas, 2 coringas, 8 versos."""
    stems = [stem for stem, _, _ in G.all_cards()]
    esperado = 52 + 2 + len(backs.BACKS)
    assert len(stems) == esperado, f"{len(stems)}, esperado {esperado}"
    assert len(set(stems)) == esperado, "stems repetidos"


def test_todo_verso_preenche_o_campo_inteiro():
    """Um pixel nao pintado deixa o creme da cinta aparecendo no meio da trama,
    e le como furo. Como as primitivas desenham soltas e sao recortadas depois,
    e facil um emblema deixar canto vazio."""
    _, _, fw, fh = G._back_field()
    for name, fn in backs.BACKS.items():
        m = fn(fw, fh)
        assert len(m) == fw * fh, (
            f"{name}: {len(m)} de {fw * fh} px pintados"
        )
        assert all(0 <= x < fw and 0 <= y < fh for x, y in m), f"{name}: vazou"


def test_os_papeis_dos_versos_estao_todos_declarados():
    """backs.ROLES e o contrato com gen_card, como court.ROLES."""
    _, _, fw, fh = G._back_field()
    assert set(G.BACK_PALETTE) == set(backs.ROLES)
    for name, fn in backs.BACKS.items():
        extra = set(fn(fw, fh).values()) - set(backs.ROLES)
        assert not extra, f"{name}: papeis fora de ROLES: {extra}"


def test_as_cintas_do_verso_cabem_no_corpo():
    ix0, iy0, ix1, iy1 = G.BODY
    fx, fy, fw, fh = G._back_field()
    inset = sum(t for t, _ in G.BACK_BANDS)
    assert fx == ix0 + inset and fy == iy0 + inset
    assert fx + fw - 1 == ix1 - inset and fy + fh - 1 == iy1 - inset
    assert inset >= G.R_IN // 2, (
        "cintas mais finas que metade do raio: a trama encosta no canto curvo"
    )


def test_svg_e_bem_formado_e_sem_tamanho_fixo():
    """Sem width/height: quem manda no tamanho e o CSS. Com eles, o leque e o
    hover ficam presos ao tamanho que o gerador escolheu."""
    for stem, name, g in G.all_cards():
        g = G.compact(g)
        buf = StringIO()

        class _Sink:
            def write_text(self, s, encoding=None):
                buf.write(s)

        G.write_svg(g, _Sink(), name)
        root = ET.fromstring(buf.getvalue())
        assert root.get("viewBox") == f"0 0 {g.w} {g.h}", stem
        assert root.get("width") is None and root.get("height") is None, stem
        assert root.get("shape-rendering") == "crispEdges", stem
        paths = root.findall("{http://www.w3.org/2000/svg}path")
        assert paths, stem
        for p in paths:
            assert p.get("class", "").startswith("f-"), stem


def test_naipes_vermelhos_usam_tinta_vermelha():
    for suit in pips.SUITS:
        g = G.build_card(suit, "a")
        red = bool(ink_pixels(g, G.INK["red"]))
        assert red == (suit in pips.RED_SUITS), suit


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_"):
            continue
        try:
            fn()
        except AssertionError as e:
            fails += 1
            print(f"FALHOU  {name}\n        {e}")
        else:
            print(f"ok      {name}")
    print()
    sys.exit(1 if fails else 0)
