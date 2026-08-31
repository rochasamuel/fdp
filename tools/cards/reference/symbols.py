"""Action-card symbols: skip, reverse, draw-two.

Sizes come from measuring the reference cards and expressing each symbol as a
fraction of the card, then applying that fraction to the 64x96 grid:

    skip    59% of card width   -> 34x34 circle
    draw2   62% of card width   -> 15 wide "+", 15x26 compact "2"
    reverse 56% of card width   -> two 22x22 arrows, one rotated 180
    draw4   58% of card width   -> four 14x20 mini cards, overlapping

The arrows and the "+2" are angular, like the deck's number glyphs. The skip
ring is the one curve in the set — a chamfered octagon was tried first and read
as a stop sign rather than a no-entry sign.

The colour-change card has no entry here: its symbol is the card's own tilted
oval, quartered, which gen_card draws as part of the body. See WHEEL_FACES.
"""


# ---------------------------------------------------------------------- skip --

SKIP_SIZE = 34


def skip(n=SKIP_SIZE, wall=4, bar_half=3):
    """Circular ring with a bottom-left to top-right bar through it.

    Proportions from the reference: wall 13% of the symbol, bar 11%. Thicker
    than that and the bar plus its outline swallow the counter, leaving two
    slivers instead of two clear triangles — it stops reading as a no-entry sign.
    """
    cx = cy = n / 2
    r_out = n / 2
    r_in = r_out - wall
    bar_c = n - 1  # bar centre line: x + y == bar_c, bottom-left to top-right

    def d2(x, y):
        return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2

    pts = set()
    for y in range(n):
        for x in range(n):
            inside = d2(x, y) <= r_out * r_out
            if not inside:
                continue
            if d2(x, y) >= r_in * r_in or abs(x + y - bar_c) <= bar_half:
                pts.add((x, y))
    return pts, n, n


def skip_small(n=11, wall=2, bar_half=1):
    """Corner version. Same circle construction, scaled down."""
    return skip(n, wall, bar_half)


# --------------------------------------------------------------------- draw2 --

PLUS = [
    ".....#####.....",
    ".....#####.....",
    ".....#####.....",
    ".....#####.....",
    ".....#####.....",
    "###############",
    "###############",
    "###############",
    "###############",
    "###############",
    ".....#####.....",
    ".....#####.....",
    ".....#####.....",
    ".....#####.....",
    ".....#####.....",
]

# A "2" at 15x26 rather than the deck's 19x32 — on the reference the digit in
# "+2" is smaller than a number card's digit, and both must fit side by side.
TWO_COMPACT = [
    "..###########..",
    ".#############.",
    "###############",
    "###############",
    "###############",
    "#####.....#####",
    "#####.....#####",
    "..........#####",
    "..........#####",
    ".........######",
    "........######.",
    ".......######..",
    "......######...",
    ".....######....",
    "....######.....",
    "...######......",
    "..######.......",
    ".######........",
    "######.........",
    "######.........",
    "######.........",
    "###############",
    "###############",
    "###############",
    "###############",
    "###############",
]

GAP = 6  # white-to-white space between "+" and "2"; 2px of outline each side


def _from_ascii(rows):
    return (
        {(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c != "."},
        len(rows[0]),
        len(rows),
    )


def draw2():
    """'+2' laid out side by side, vertically centred on each other."""
    plus, pw, ph = _from_ascii(PLUS)
    two, tw, th = _from_ascii(TWO_COMPACT)
    h = max(ph, th)
    p_off = (h - ph) // 2
    t_off = (h - th) // 2
    pts = {(x, y + p_off) for x, y in plus}
    pts |= {(x + pw + GAP, y + t_off) for x, y in two}
    return pts, pw + GAP + tw, h


DRAW2_SMALL_PLUS = [
    "..#..",
    "..#..",
    "#####",
    "..#..",
    "..#..",
]


def draw2_small():
    """Corner '+2': a 5x5 plus next to the deck's small 2."""
    return _plus_digit_small(2)


# ------------------------------------------------------------------- reverse --

ARROW = 22


def _arrow(n=ARROW, head=11, shaft_half=3):
    """Chunky 45-degree arrow pointing up-right, tip at the top-right corner.

    Head is an explicit right triangle: tip at (n-1, 0), legs down the right
    edge and along the top edge, hypotenuse y == x - (n-1-head). Shaft is a
    45-degree band on x + y == n - 1, cut off where the head begins.

    Building the head from a band that tapers gave a spindly arrow; a real
    triangle is what the reference draws.
    """
    back = n - 1 - head  # x where the hypotenuse meets the top edge
    pts = set()
    for y in range(n):
        for x in range(n):
            in_head = x >= back and y <= x - back
            in_shaft = abs(x + y - (n - 1)) <= shaft_half and x - y <= back
            if in_head or in_shaft:
                pts.add((x, y))
    return pts, n, n


def _two_arrows(n, head, shaft_half, sep):
    """One arrow plus its 180-degree rotation, offset along (1,1).

    `sep` is the offset perpendicular to the shafts. It has to clear twice the
    head's half-width in the x+y axis plus room for both black outlines, or the
    two arrows fuse into one blob once they are stamped. That half-width is
    `head`, so sep must exceed head + outline*sqrt(2) — the constraint comes
    from the heads, not the shafts.
    """
    a, _, _ = _arrow(n, head, shaft_half)
    pts = set(a) | {(n - 1 - x + sep, n - 1 - y + sep) for x, y in a}
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = min(xs), min(ys)
    return ({(x - x0, y - y0) for x, y in pts},
            max(xs) - x0 + 1, max(ys) - y0 + 1)


def reverse(sep=10):
    return _two_arrows(ARROW, 11, 3, sep)


def reverse_small():
    """Corner mark: the same two-arrow construction, 9px per arrow.

    A horizontal double-headed bar was tried first and read as plumbing, not as
    arrows. Two real diagonal arrows do fit — they just need sep large enough
    (7 here) that the 1px outline can separate the heads. That makes this corner
    mark bigger than the digits' (16x16 vs 6x9), which is the trade for having
    it actually look like the centre symbol.
    """
    return _two_arrows(9, 5, 1, 7)


# ---------------------------------------------------------------------- wild --
# These are the only multi-coloured symbols. A symbol function may return a
# fourth element, paint(x, y) -> role name, which gen_card resolves against the
# palette. Roles: "red" / "yellow" / "green" / "blue" / "ink"; None means the
# default paper fill.

QUADRANTS = ("red", "blue", "yellow", "green")  # TL, TR, BL, BR — from the sheet


def quadrant_uv(u, v):
    """Which suit a point belongs to, given its coordinates in the oval's own
    rotated frame. u runs along the minor axis, v along the major one.

    Splitting on screen axes instead leaves wildly unequal quadrants, because
    the oval is tilted 25 degrees — red ends up a sliver and blue a slab.
    """
    return QUADRANTS[(2 if v > 0 else 0) + (1 if u > 0 else 0)]


# The colour-change card has no centre symbol of its own: the card's tilted oval
# IS the symbol, split into four quadrants. gen_card handles that, since the
# oval is drawn by the card body, not stamped as a glyph.
WHEEL_FACES = ("change",)


def draw4_center():
    """Four overlapping mini cards, one per suit — the classic +4 face.

    Drawn back to front into a role map rather than composed from point sets,
    because the overlaps have to occlude: each mini card lays down an ink margin,
    then a white border, then its colour, so the card in front cuts a clean edge
    into the one behind it.
    """
    CARD_W, CARD_H = 14, 20  # including the 1px ink margin and 1px white border
    # (x, y, suit), back to front. Positions traced off the reference cluster:
    # yellow top-right, green bottom-left, blue behind red in the middle.
    LAYOUT = [
        (23, 0, "yellow"),
        (2, 25, "green"),
        (10, 9, "blue"),
        (19, 16, "red"),
    ]
    w = max(x for x, _, _ in LAYOUT) + CARD_W
    h = max(y for _, y, _ in LAYOUT) + CARD_H

    role = {}

    def rrect(x0, y0, x1, y1, r, name):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                dx = min(x - x0, x1 - x)
                dy = min(y - y0, y1 - y)
                if dx + dy < r:  # 45-degree corner cut, matching the deck
                    continue
                role[(x, y)] = name

    for ox, oy, suit in LAYOUT:
        rrect(ox, oy, ox + CARD_W - 1, oy + CARD_H - 1, 2, "ink")
        rrect(ox + 1, oy + 1, ox + CARD_W - 2, oy + CARD_H - 2, 2, None)
        rrect(ox + 2, oy + 2, ox + CARD_W - 3, oy + CARD_H - 3, 1, suit)

    return set(role), w, h, lambda x, y: role[(x, y)]


# Centre symbols that already carry their own ink margins, so the usual outline
# pass would only pile a black halo on top.
CENTER_OUTLINE = {"draw4": 0}


def _plus_digit_small(n):
    """Corner '+N': a 5x5 plus next to the deck's small digit."""
    import glyphs

    plus, pw, ph = _from_ascii(DRAW2_SMALL_PLUS)
    dig, dw, dh = glyphs.small_digit(n)
    height = max(ph, dh)
    pts = {(x, y + (height - ph) // 2) for x, y in plus}
    pts |= {(x + pw + 2, y + (height - dh) // 2) for x, y in dig}
    return pts, pw + 2 + dw, height


def draw4_small():
    return _plus_digit_small(4)


def wild_small(block=4, gap=1):
    """Corner mark for both wild cards: a 2x2 of suit-coloured blocks.

    The blocks are the glyph; the gap between them is left empty so the outline
    pass fills it with ink, which draws the dividing cross for free.
    """
    n = block * 2 + gap
    pts = {
        (x, y)
        for y in range(n)
        for x in range(n)
        if not (block <= x < block + gap or block <= y < block + gap)
    }

    def paint(x, y):
        return QUADRANTS[(2 if y >= block else 0) + (1 if x >= block else 0)]

    return pts, n, n, paint


# ---------------------------------------------------------------------- back --
# The card back: the "NUO" wordmark, tilted to sit on the oval. The name of the
# game, and deliberately not the retail one — the deck is drawn from scratch,
# and the word on the back is the one part that would otherwise be a copy.

# Same 25 degrees the oval is tilted by — the deck has one angle, not two. The
# sign is flipped, though, so the word ascends to the right while the oval's
# long axis ascends to the right at 65. Both lean the same way; the word crosses
# the oval instead of running up it, which is the only direction that stays
# readable. (Running along the long axis would set "NUO" near-vertically.)
MARK_COS, MARK_SIN = 0.906, 0.423


def rotate_pts(pts, w, h, cos_t=MARK_COS, sin_t=MARK_SIN):
    """Rasterise a point set rotated by +t (ascending to the right, y down).

    Inverse-mapped: it walks the *destination* pixels and asks each one where it
    came from. Forward-rotating the source points instead leaves holes — at 25
    degrees several source pixels land on the same destination and others get
    skipped entirely — and holes inside a glyph fill with outline ink.

    Returns (points, width, height) with the result moved back to the origin.
    """
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    fx = [x * cos_t + y * sin_t for x, y in corners]
    fy = [-x * sin_t + y * cos_t for x, y in corners]
    x0, x1 = int(min(fx)) - 1, int(max(fx)) + 1
    y0, y1 = int(min(fy)) - 1, int(max(fy)) + 1

    out = set()
    for Y in range(y0, y1 + 1):
        for X in range(x0, x1 + 1):
            # centre of the destination pixel, rotated back into glyph space
            u, v = X + 0.5, Y + 0.5
            sx = u * cos_t - v * sin_t
            sy = u * sin_t + v * cos_t
            if (int(sx), int(sy)) in pts and sx >= 0 and sy >= 0:
                out.add((X, Y))

    ox = min(x for x, _ in out)
    oy = min(y for _, y in out)
    return ({(x - ox, y - oy) for x, y in out},
            max(x for x, _ in out) - ox + 1,
            max(y for _, y in out) - oy + 1)


def back_mark():
    """The tilted 'NUO' wordmark."""
    import glyphs

    # Same three letters, same widths, same tracking as before: the tilted
    # bounding box is unchanged, so the fit against the 52px inner width that
    # LETTER_H was chosen for still holds.
    return rotate_pts(*glyphs.word("NUO"))


FACES = {
    "skip": (skip, skip_small),
    "reverse": (reverse, reverse_small),
    "draw2": (draw2, draw2_small),
    # change has no centre glyph — see WHEEL_FACES above.
    "change": (None, wild_small),
    "draw4": (draw4_center, draw4_small),
    # The back has no corner mark; see NO_CORNER.
    "back": (back_mark, None),
}

# Faces that carry no suit colour of their own.
WILD_FACES = ("change", "draw4")

# Faces with no corner mark. The corner digits exist so you can read a card in a
# fanned hand; a fan of backs has nothing to read, and a third figure on the
# card would only compete with the wordmark.
NO_CORNER = {"back"}

# The wordmark is smaller than a digit, so it takes the hairline outline the
# corner marks use rather than the 2px one the big glyphs use. At 2px the
# outline would eat the 4px counters from both sides and close them completely.
CENTER_OUTLINE["back"] = 1
