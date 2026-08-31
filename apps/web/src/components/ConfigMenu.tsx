import type { ReactNode } from "react";
import { BACKS, backUrl } from "../lib/cards";
import { FELTS } from "../lib/felt";
import { useUi } from "../store/ui";

type Props = {
  /**
   * Se a janela é grande o bastante para a mesa redonda. A chave dela só
   * aparece onde ela funciona: oferecê-la num celular seria oferecer um botão
   * que não faz nada — a fileira quebra em três linhas e a roda não cabe.
   */
  wide: boolean;
};

/**
 * Os ajustes de quem olha a mesa.
 *
 * Nada aqui atravessa a rede: o pano, a roda e o movimento são de quem está
 * olhando, e mudam a tela dele e só a dele. É por isso que eles moram num
 * painel separado do que vier a ser o combinado da partida — juntos, se leriam
 * como regra de jogo.
 *
 * Mecânica de `<details>` pendurado na barra do cabeçalho, com `name`: abrir um
 * fecha o outro, senão dois painéis caem no mesmo canto, um por cima do outro.
 */
export function ConfigMenu({ wide }: Props) {
  const seatLayout = useUi((ui) => ui.seatLayout);
  const setSeatLayout = useUi((ui) => ui.setSeatLayout);
  const lowMotion = useUi((ui) => ui.lowMotion);
  const setLowMotion = useUi((ui) => ui.setLowMotion);
  const felt = useUi((ui) => ui.felt);
  const setFelt = useUi((ui) => ui.setFelt);
  const back = useUi((ui) => ui.back);
  const setBack = useUi((ui) => ui.setBack);

  return (
    <details className="fdp-menu" name="fdp-header">
      {/* No celular a palavra sai e fica o glifo. Quem lê a tela com os
          ouvidos ouve o `aria-label`. */}
      <summary className="px-link" aria-label="Ajustes da tela">
        ▤<span className="hidden sm:inline"> ajustes</span>
      </summary>

      <div className="px-slab fdp-menu-panel flex flex-col gap-3 p-4">
        {/*
          As cinco amostras são a própria escolha: um seletor com o nome das
          cores diria "vinho" onde a amostra já mostra o vinho. O nome continua
          existindo no `title` e no `aria-label`, para quem não vê a cor.
        */}
        <div className="flex flex-col gap-2">
          <span className="px-label">Pano da mesa</span>
          <div role="radiogroup" aria-label="Pano da mesa" className="flex gap-2">
            {FELTS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={felt === key}
                aria-label={label}
                title={label}
                onClick={() => setFelt(key)}
                className="fdp-felt-chip size-7"
                style={{ background: `var(--felt-${key})` }}
              />
            ))}
          </div>
        </div>

        {/*
          O verso é a mesma escolha do pano, e por isso a mesma fileira: são as
          oito artes em miniatura, e a miniatura já é a resposta. Elas quebram
          em duas linhas onde o painel é estreito — oito cartas não cabem lado
          a lado num celular, e encolhê-las até caber apagaria a trama que se
          está escolhendo.
        */}
        <div className="flex flex-col gap-2">
          <span className="px-label">Verso das cartas</span>
          <div role="radiogroup" aria-label="Verso das cartas" className="flex flex-wrap gap-2">
            {BACKS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={back === key}
                aria-label={label}
                title={label}
                onClick={() => setBack(key)}
                className="fdp-back-chip"
              >
                <img src={backUrl(key)} alt="" />
              </button>
            ))}
          </div>
        </div>

        {wide && (
          <Switch
            on={seatLayout === "ring"}
            onToggle={() => setSeatLayout(seatLayout === "ring" ? "row" : "ring")}
            label="Mesa redonda"
            hint="Os assentos em roda em volta das pilhas, no lugar da fileira no topo."
          />
        )}
        <Switch
          on={lowMotion}
          onToggle={() => setLowMotion(!lowMotion)}
          label="Movimento reduzido"
          state={["ligado", "desligado"]}
          hint="As cartas trocam de lugar sem voar, e nada pisca. O sistema pode ligar isto sozinho."
        />
      </div>
    </details>
  );
}

/**
 * Preenchido é ligada, vazado é desligada — a mesma leitura do ponto de
 * conexão nos assentos. A linha inteira é o botão: o alvo é o texto que se
 * está lendo, e não o quadradinho de 8px.
 */
function Switch({
  on,
  onToggle,
  label,
  hint,
  /* O rótulo do estado concorda com o nome da chave — "mesa redonda ligada",
     "movimento reduzido ligado" —, então quem escreve o nome escolhe o par. */
  state = ["ligada", "desligada"],
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  hint: ReactNode;
  state?: readonly [string, string];
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="fdp-switch flex items-start gap-2 text-left"
    >
      {/* O estado mora no `aria-checked`, e o CSS o lê de lá: uma verdade só
          para o leitor de tela e para os olhos. */}
      <span aria-hidden className="fdp-switch-dot mt-1 inline-block size-2 shrink-0" />
      <span className="flex flex-col">
        <span className="fdp-switch-label text-sm">
          {label}
          <span className="px-label ml-2">{on ? state[0] : state[1]}</span>
        </span>
        <span className="text-xs" style={{ color: "var(--paper-sh)" }}>
          {hint}
        </span>
      </span>
    </button>
  );
}
