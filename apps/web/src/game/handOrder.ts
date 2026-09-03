import { cardPower } from "@fdp/shared";
import type { HandEntry } from "../components/Hand";

/**
 * A ordem do leque é de quem olha, e não da partida.
 *
 * O servidor manda a mão na ordem em que ela foi montada — compra atrás de
 * compra — e nunca ouve falar do que se faz aqui: arrastar uma carta para o
 * lado ou pedir o leque ordenado por força não é jogada, é arrumar as cartas
 * na mão. Por isso tudo neste arquivo é conta pura sobre uma lista de ids: o
 * `Table` guarda a lista, o `Hand` a aplica, e nada disso atravessa a rede.
 */
export type SortDirection = "desc" | "asc";

/**
 * A ordem guardada contra a mão de agora: some quem foi jogado, entra no fim
 * quem foi comprado. Chamada a cada patch da mesa, e é ela que faz a ordem
 * escolhida sobreviver à rodada inteira em vez de só ao render seguinte.
 */
export function reconcile(order: string[], ids: string[]): string[] {
  const inHand = new Set(ids);
  const known = new Set(order);
  return [...order.filter((id) => inHand.has(id)), ...ids.filter((id) => !known.has(id))];
}

/**
 * O leque na ordem escolhida.
 *
 * `flying` são as cartas que ainda estão no ar, compradas há um instante. Elas
 * ficam onde estão — no fim, que é de onde o servidor as manda e para onde o
 * voo mira. Mexer nelas faria a carta aterrissar num slot que não é o dela;
 * ver `airborne` no `Hand`.
 */
export function applyOrder(entries: HandEntry[], order: string[], flying = 0): HandEntry[] {
  if (order.length === 0) return entries;
  const settled = entries.slice(0, Math.max(0, entries.length - flying));
  const pending = new Map(settled.map((entry) => [entry.id, entry]));

  const arranged: HandEntry[] = [];
  for (const id of order) {
    const entry = pending.get(id);
    if (entry) {
      arranged.push(entry);
      pending.delete(id);
    }
  }
  // O que a ordem não conhece guarda o lugar que tinha, e não o fim da fila.
  for (const entry of settled) if (pending.has(entry.id)) arranged.push(entry);

  return [...arranged, ...entries.slice(settled.length)];
}

/**
 * A carta solta em cima de outra toma o lugar dela.
 *
 * Para que lado ela entra sai de onde ela estava: vindo da esquerda para a
 * direita, ela passa a ser a carta DEPOIS do alvo; vindo da direita, a de
 * antes. É a leitura do gesto — a carta para onde o dedo a levou, e não uma
 * casa a mais ou a menos.
 */
export function moveCard(order: string[], id: string, targetId: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return order;

  const rest = order.filter((other) => other !== id);
  const at = rest.indexOf(targetId);
  rest.splice(from < to ? at + 1 : at, 0, id);
  return rest;
}

/**
 * O leque ordenado por força, agora — e não um modo que se mantém: as cartas
 * compradas depois disto entram no fim, como sempre entraram.
 *
 * As às cegas não têm força para ler: a tela não sabe qual carta é aquela, e
 * fingir uma posição para ela seria inventar. Elas ficam no fim, na ordem em
 * que já estavam.
 */
export function powerOrder(entries: HandEntry[], direction: SortDirection): string[] {
  const known = entries.filter((entry) => entry.card !== null);
  const blind = entries.filter((entry) => entry.card === null);
  const sign = direction === "desc" ? -1 : 1;

  const sorted = [...known].sort(
    (a, b) => sign * (cardPower(a.card!) - cardPower(b.card!)),
  );
  return [...sorted, ...blind].map((entry) => entry.id);
}
