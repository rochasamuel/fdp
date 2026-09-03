import { describe, expect, test } from "vitest";
import type { Card } from "@fdp/shared";
import type { HandEntry } from "../components/Hand";
import { applyOrder, moveCard, powerOrder, reconcile } from "./handOrder";

/** Uma posição do leque com carta de verdade, para as contas de força. */
const card = (id: string, suit: Card["suit"], rank: Card["rank"]): HandEntry => ({
  id,
  card: { id, suit, rank },
});

/** A carta às cegas: existe no leque e a tela não sabe qual é. */
const hidden = (id: string): HandEntry => ({ id, card: null });

const ids = (entries: HandEntry[]) => entries.map((entry) => entry.id);

describe("reconcile", () => {
  test("mantém a ordem escolhida e põe as compradas no fim", () => {
    expect(reconcile(["c", "a"], ["a", "b", "c", "d"])).toEqual(["c", "a", "b", "d"]);
  });

  test("esquece as cartas que saíram da mão", () => {
    expect(reconcile(["c", "a", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("applyOrder", () => {
  test("põe o leque na ordem escolhida", () => {
    const entries = [card("a", "spades", "5"), card("b", "hearts", "7"), card("c", "clubs", "4")];
    expect(ids(applyOrder(entries, ["c", "a", "b"]))).toEqual(["c", "a", "b"]);
  });

  test("sem ordem escolhida, o leque é o que o servidor mandou", () => {
    const entries = [card("a", "spades", "5"), card("b", "hearts", "7")];
    expect(applyOrder(entries, [])).toBe(entries);
  });

  test("as cartas ainda no ar ficam no fim, fora da ordem", () => {
    const entries = [card("a", "spades", "5"), card("b", "hearts", "7"), card("c", "clubs", "4")];
    // "c" acabou de ser comprada e ainda está voando: mesmo que a ordem a
    // chame para a frente, ela guarda o último lugar — é lá que o voo mira.
    expect(ids(applyOrder(entries, ["c", "b", "a"], 1))).toEqual(["b", "a", "c"]);
  });
});

describe("moveCard", () => {
  test("arrastar para a direita solta depois do alvo", () => {
    expect(moveCard(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  test("arrastar para a esquerda solta antes do alvo", () => {
    expect(moveCard(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  test("soltar na própria carta não mexe em nada", () => {
    const order = ["a", "b", "c"];
    expect(moveCard(order, "b", "b")).toBe(order);
  });
});

describe("powerOrder", () => {
  // O 4♣ é o zap, a carta mais forte do baralho; o 5♠ é quase a mais fraca.
  const entries = [card("cinco", "spades", "5"), card("zap", "clubs", "4"), card("as", "hearts", "a")];

  test("mais forte primeiro", () => {
    expect(powerOrder(entries, "desc")).toEqual(["zap", "as", "cinco"]);
  });

  test("mais fraca primeiro", () => {
    expect(powerOrder(entries, "asc")).toEqual(["cinco", "as", "zap"]);
  });

  test("as cartas às cegas ficam no fim: não há força para ler", () => {
    const blind = [hidden("x"), card("zap", "clubs", "4"), hidden("y")];
    expect(powerOrder(blind, "desc")).toEqual(["zap", "x", "y"]);
  });
});
