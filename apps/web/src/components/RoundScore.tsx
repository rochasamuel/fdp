import type { RoundResult, TableState } from "@fdp/shared";

/**
 * O placar da rodada. Uma linha por jogador: o que prometeu, o que fez, o que
 * isso custou e o que sobrou. A coluna que importa é a do meio — é a distância
 * entre as duas primeiras que vira pontos perdidos.
 */
export function RoundScore({
  results,
  players,
  you,
  cards,
  round,
}: {
  results: RoundResult[];
  players: TableState["players"];
  you: string;
  cards: number;
  round: number;
}) {
  const name = (id: string) => players.find((player) => player.id === id)?.name ?? "—";

  return (
    <div className="fixed inset-0 z-40 grid place-content-center bg-black/70 p-4">
      <div className="px-slab flex flex-col gap-3 p-6">
        <p className="px-label text-center">
          Rodada {round} · {cards} carta{cards === 1 ? "" : "s"}
        </p>
        <table className="fdp-score-table text-sm">
          <thead>
            <tr className="px-label">
              <th className="text-left">jogador</th>
              <th>prometeu</th>
              <th>fez</th>
              <th>perdeu</th>
              <th>restam</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.playerId} className={result.eliminated ? "is-out" : ""}>
                <td
                  className="text-left"
                  style={{
                    color: result.playerId === you ? "var(--mark)" : "var(--paper-hi)",
                  }}
                >
                  {name(result.playerId)}
                  {result.playerId === you && " (você)"}
                </td>
                <td>{result.promise}</td>
                <td>{result.tricks}</td>
                <td style={{ color: result.lost === 0 ? "var(--live)" : "var(--ink-red)" }}>
                  {result.lost === 0 ? "—" : `-${result.lost}`}
                </td>
                {/* Quem passou do zero aparece com o saldo negativo: é ele que
                    diz quem chegou mais perto quando a rodada derruba vários
                    de uma vez, e "0 e 0" não diria nada. */}
                <td>
                  <b
                    style={{
                      color: result.overshoot < 0 ? "var(--ink-red)" : "var(--paper-hi)",
                    }}
                  >
                    {result.overshoot < 0 ? result.overshoot : result.points}
                  </b>
                  {result.eliminated && <span className="px-label"> fora</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
