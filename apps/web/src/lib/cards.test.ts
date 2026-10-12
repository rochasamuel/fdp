import { describe, expect, it } from "vitest";
import type { Card } from "@fdp/shared";
import { strongestIndex } from "./cards";

const c = (suit: Card["suit"], rank: Card["rank"]) => ({ suit, rank });

describe("strongestIndex", () => {
  it("aponta a carta mais forte da pilha", () => {
    expect(strongestIndex([c("hearts", "5"), c("spades", "3"), c("clubs", "k")], false)).toBe(1);
  });

  it("vazia, não aponta nenhuma", () => {
    expect(strongestIndex([], false)).toBe(-1);
  });

  it("com o porcão ligado e o zap na mesa, o 4♠ fica por cima", () => {
    expect(strongestIndex([c("clubs", "4"), c("spades", "4")], true)).toBe(1);
  });

  it("com o porcão ligado e sem o zap, o 4♠ é a mais fraca", () => {
    expect(strongestIndex([c("spades", "4"), c("diamonds", "4")], true)).toBe(1);
  });

  it("com o porcão desligado, o zap continua por cima", () => {
    expect(strongestIndex([c("clubs", "4"), c("spades", "4")], false)).toBe(0);
  });
});
