import { RULES, type HouseRules } from "@fdp/shared";

type Props = {
  /** O combinado da mesa, decidido na criação e imutável depois. */
  rules: HouseRules;
  /** O teto de cartas por rodada; `0` é o que o baralho der. */
  maxCards: number;
  /** Com quantos pontos todo mundo sentou. */
  startingPoints: number;
};

/**
 * O combinado em vigor, à mão durante a partida.
 *
 * Na criação as regras estão escritas na tela, mas quem entrou há três rodadas
 * já não as tem à vista — e são elas que decidem se dois valetes na mesa se
 * anulam ou se um deles leva a mão. Fica no cabeçalho, fechado, porque é
 * consulta e não aviso.
 *
 * `<details>` e não um menu de verdade: abrir, fechar, o Esc e o foco são do
 * navegador, e o que sobra para escrever é a aparência.
 *
 * Divide as classes e o `name` com o painel de ajustes: os dois caem no mesmo
 * canto da barra, e abrir um fecha o outro.
 */
export function RulesMenu({ rules, maxCards, startingPoints }: Props) {
  const on = RULES.filter(({ key }) => rules[key]).length;

  return (
    <details className="fdp-menu" name="fdp-header">
      <summary className="px-link" aria-label="Regras da casa">
        {/* A conta no rótulo é o que se quer saber de relance: se a mesa tem
            alguma variação de pé. Abrir é para descobrir quais.

            No celular fica só ela, ao lado da engrenagem dos ajustes: numa tira
            de uma linha a palavra "regras" custa o lugar do nome da mesa, e a
            conta é justamente a parte que não dá para adivinhar do desenho. O
            nome inteiro continua no `aria-label`. */}
        ⚙ <span className="hidden sm:inline">regras · </span>
        {on}/{RULES.length}
      </summary>

      <div className="px-slab fdp-menu-panel flex flex-col gap-3 p-4">
        {/* O teto do ciclo. Não é uma regra que liga ou desliga — é uma medida
            da mesa, como o número de lugares —, então fica fora da conta do
            rótulo e antes das duas, que é a ordem em que foram escolhidas. */}
        <p className="flex flex-col text-left">
          <span className="text-sm" style={{ color: "var(--paper-hi)" }}>
            Máximo de cartas por rodada
            <span className="px-label ml-2">
              {maxCards > 0 ? maxCards : "sem teto"}
            </span>
          </span>
          <span className="text-xs" style={{ color: "var(--paper-sh)" }}>
            {maxCards > 0
              ? `A rodada sobe até ${maxCards} cartas e volta para uma.`
              : "A rodada sobe até o baralho não dar mais, e volta para uma."}
          </span>
        </p>

        {/* Com quantos pontos a mesa sentou. Como o teto de cartas, é medida e
            não regra: quem entrou depois precisa dela para saber se está perto
            da porta da rua ou no começo de uma partida longa. */}
        <p className="flex flex-col text-left">
          <span className="text-sm" style={{ color: "var(--paper-hi)" }}>
            Pontos de cada jogador
            <span className="px-label ml-2">{startingPoints}</span>
          </span>
          <span className="text-xs" style={{ color: "var(--paper-sh)" }}>
            Todo mundo sentou com {startingPoints}; zero é a porta da rua.
          </span>
        </p>

        {RULES.map(({ key, label, hint }) => (
          <p key={key} className="flex items-start gap-2 text-left">
            {/* Preenchido é ligada, vazado é desligada — a mesma leitura do
                ponto de conexão nos assentos. */}
            <span
              aria-hidden
              className="mt-1 inline-block size-2 shrink-0"
              style={{
                background: rules[key] ? "var(--mark)" : "transparent",
                border: "2px solid var(--gloss)",
              }}
            />
            <span className="flex flex-col">
              <span
                className="text-sm"
                style={{ color: rules[key] ? "var(--paper-hi)" : "var(--gloss)" }}
              >
                {label}
                <span className="px-label ml-2">{rules[key] ? "ligada" : "desligada"}</span>
              </span>
              <span className="text-xs" style={{ color: "var(--paper-sh)" }}>
                {hint}
              </span>
            </span>
          </p>
        ))}
      </div>
    </details>
  );
}
