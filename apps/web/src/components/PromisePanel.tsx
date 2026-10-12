import { useEffect, useRef, useState } from "react";

/**
 * O tempo em que o Confirmar nasce surdo.
 *
 * Este painel aparece exatamente onde o placar da rodada acabou de sumir, e
 * quem declara primeiro o recebe no mesmo quadro em que a tela troca. No
 * telefone isso é uma armadilha: o toque que já estava a caminho — quem
 * cutuca a tela esperando o placar passar — cai num Confirmar que ainda
 * mostra o zero do começo, e a promessa mais cara do jogo sai sem ninguém ter
 * escolhido nada. Aconteceu em rodadas seguidas com quem declarava primeiro.
 *
 * O remédio é o botão não aceitar o que não foi decidido: quem realmente
 * escolheu um número leva muito mais que isto para apertar, e quem estava só
 * cutucando a tela não perde a rodada por causa disso.
 */
const BID_TAP_GUARD = 450;

/**
 * A promessa: quantas vazas você diz que vai fazer.
 *
 * Um contador em vez de uma botoeira: com dez cartas na mão a fileira de
 * botões enchia a barra inteira, e o número que você quer é quase sempre
 * vizinho do anterior. Deitado no desktop, em pé no telefone.
 *
 * Quem diz o que é possível é o SERVIDOR — `options` é a lista que ele mandou,
 * e a tela não recalcula nada. O contador anda por cima do número proibido em
 * vez de pulá-lo: pular faria o `+` parecer defeito. Ele avisa, e não deixa
 * confirmar.
 */
export function PromisePanel({
  cards,
  promised,
  options,
  onPromise,
}: {
  cards: number;
  promised: number;
  options: number[];
  onPromise: (promise: number) => void;
}) {
  // Começa no primeiro número que dá para confirmar — zero, quase sempre.
  const [value, setValue] = useState(() => (options.includes(0) ? 0 : (options[0] ?? 0)));
  // Ver `BID_TAP_GUARD`: o botão só passa a ouvir depois que o painel assentou.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), BID_TAP_GUARD);
    return () => clearTimeout(timer);
  }, []);
  /*
   * O aviso é um balão que fica de pé enquanto o número recusado estiver no
   * mostrador: ele não é um recado que passa, é o motivo de o Confirmar não
   * funcionar, e sumir sozinho deixaria o botão morto sem explicação. Quem o
   * apaga é trocar para um número que dá.
   *
   * O `seq` é o que faz o aviso saltar DE NOVO quando você insiste no
   * Confirmar: sem uma chave nova o React reaproveita o nó, a animação não
   * recomeça, e quem apertou não vê resposta nenhuma.
   */
  const [warning, setWarning] = useState<{ text: string; seq: number } | null>(null);
  const seq = useRef(0);

  const allowed = options.includes(value);

  const warn = (n: number) => {
    seq.current += 1;
    setWarning({
      text: `você é o último a declarar: a soma das promessas não pode dar ${cards}. Já foram ${promised}, então ${n} está fora.`,
      seq: seq.current,
    });
  };

  const step = (delta: number) => {
    const next = Math.min(cards, Math.max(0, value + delta));
    if (next === value) return;
    setValue(next);
    if (options.includes(next)) setWarning(null);
    else warn(next);
  };

  const confirm = () => {
    if (allowed) onPromise(value);
    else warn(value);
  };

  return (
    <div className="relative">
      {/* Fora do quadro e por cima dele: o aviso não pode empurrar os botões
          para baixo no meio de uma escolha. */}
      {warning && (
        <div
          key={warning.seq}
          role="status"
          className="fdp-warn px-slab pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[min(22rem,80vw)] -translate-x-1/2 px-3 py-2"
        >
          <p className="px-label text-center" style={{ color: "var(--mark)" }}>
            ⚠ {warning.text}
          </p>
        </div>
      )}

      <div className="px-slab flex flex-col items-center gap-3 px-4 py-3 md:flex-row md:gap-4">
        <p className="px-label text-center md:max-w-32 md:text-left">
          Sua promessa · quantas mãos você faz?
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="px-btn"
            onClick={() => step(-1)}
            disabled={value === 0}
            aria-label="uma mão a menos"
          >
            −
          </button>
          <span
            className="fdp-bid"
            aria-live="polite"
            style={{ color: allowed ? "var(--mark)" : "var(--ink-red)" }}
          >
            {value}
          </span>
          <button
            type="button"
            className="px-btn"
            onClick={() => step(1)}
            disabled={value === cards}
            aria-label="uma mão a mais"
          >
            +
          </button>
        </div>

        <button
          type="button"
          className={`px-btn w-full md:w-auto ${allowed ? "px-btn-primary" : ""}`}
          disabled={!ready}
          onClick={confirm}
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}
