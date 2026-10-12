import type { TableState } from "@fdp/shared";

/** O fim da partida: quem venceu, como cada um terminou, e as duas saídas. */
export function GameOver({
  players,
  winnerIds,
  you,
  isHost,
  onRestart,
  onExit,
}: {
  players: TableState["players"];
  winnerIds: string[];
  you: string;
  isHost: boolean;
  onRestart: () => void;
  onExit: () => void;
}) {
  // Quem venceu: um de costume, vários quando a última rodada zerou a mesa
  // inteira no mesmo saldo, nenhum quando não sobrou ninguém.
  const champions = players.filter((player) => winnerIds.includes(player.id));

  return (
    <div className="fixed inset-0 z-40 grid place-content-center bg-black/70 p-4">
      <div className="px-slab flex flex-col items-center gap-4 p-8 text-center">
        <p className="px-label">Fim de partida</p>
        <p className="px-code">
          {champions.length > 0
            ? champions.map((player) => player.name).join(" e ")
            : "Ninguém"}
        </p>
        <p className="px-label">
          {champions.length > 1
            ? "empataram no fundo do poço"
            : champions.length === 1
              ? "foi o último de pé"
              : "sobrou de pé"}
        </p>

        {/* Como cada um terminou. Perder não é vergonha nenhuma neste jogo:
            é o placar de quantas rodadas cada um aguentou.

            Quem passou do zero aparece com o saldo negativo, e não com o
            zero da regra: quando a última rodada derruba a mesa inteira,
            "0 e 0" não diz nada, e "-1 e -3" diz tudo. */}
        <ul className="flex w-full flex-col gap-1 text-sm">
          {[...players]
            .sort((a, b) => b.overshoot - a.overshoot)
            .map((player) => {
              const crowned = winnerIds.includes(player.id);
              const short = player.overshoot < 0;
              return (
                <li key={player.id} className="flex items-baseline justify-between gap-4">
                  <span style={{ color: crowned ? "var(--mark)" : "var(--paper-sh)" }}>
                    {crowned && "👑 "}
                    {player.name}
                    {player.id === you && " (você)"}
                  </span>
                  <span style={{ color: short ? "var(--ink-red)" : "var(--paper-hi)" }}>
                    {short ? player.overshoot : player.points} pt
                  </span>
                </li>
              );
            })}
        </ul>

        {/* Duas saídas para o fim da partida: outra mão, ou a porta. Quem
            não é host só tem a porta — e antes não tinha nenhuma. */}
        <div className="flex flex-col items-stretch gap-2">
          {isHost ? (
            <button
              type="button"
              onClick={onRestart}
              className="px-btn px-btn-primary"
            >
              Jogar de novo
            </button>
          ) : (
            <p className="px-label">Aguardando o host começar outra</p>
          )}
          <button type="button" onClick={onExit} className="px-btn">
            Voltar ao início
          </button>
        </div>
      </div>
    </div>
  );
}
