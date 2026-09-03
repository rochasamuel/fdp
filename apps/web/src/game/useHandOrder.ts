import { useCallback, useMemo, useState } from "react";
import type { HandEntry } from "../components/Hand";
import { moveCard, powerOrder, reconcile, type SortDirection } from "./handOrder";

/**
 * A ordem em que VOCÊ deixou as cartas na mão.
 *
 * Vive aqui, no cliente, e some quando a aba fecha: a mão morre a cada rodada,
 * e guardá-la seria guardar cartas que não existem mais. A lista fica vazia
 * enquanto ninguém mexeu — o leque é o que o servidor mandou, e é assim que
 * ele continua até alguém arrastar uma carta ou pedir a ordenação.
 *
 * As contas moram no `handOrder.ts`; o que este arquivo acrescenta é lembrar
 * da lista entre um patch da mesa e o seguinte.
 */
export function useHandOrder(entries: HandEntry[]) {
  const [chosen, setChosen] = useState<string[]>([]);

  const order = useMemo(
    () => (chosen.length ? reconcile(chosen, entries.map((entry) => entry.id)) : chosen),
    [chosen, entries],
  );

  /** A carta solta em cima de outra toma o lugar dela. */
  const move = useCallback(
    (id: string, targetId: string) =>
      setChosen((previous) => {
        const current = previous.length ? reconcile(previous, entries.map((e) => e.id)) : entries.map((e) => e.id);
        return moveCard(current, id, targetId);
      }),
    [entries],
  );

  /** Ordenar é uma ação, e não um modo: o que vier depois entra no fim. */
  const sort = useCallback(
    (direction: SortDirection) => setChosen(powerOrder(entries, direction)),
    [entries],
  );

  return { order, move, sort };
}
