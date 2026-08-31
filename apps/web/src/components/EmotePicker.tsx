import { useEffect, useRef, useState } from "react";
import { EMOTE_COOLDOWN, EMOTES, type Emote } from "@fdp/shared";

type Props = {
  onSend: (emote: Emote) => void;
};

/**
 * O teclado da conversa: dez frases inteiras, uma por tecla.
 *
 * Fica na fileira de ações, junto das outras, porque é lá que a mão já está — no
 * celular, falar não pode custar uma viagem do polegar até o cabeçalho.
 *
 * `<details>` como no menu das regras: abrir, fechar, o Esc e o foco são do
 * navegador, e o que sobra para escrever é a aparência. Fechar depois de falar
 * é a única parte manual, e é a certa: quem escolheu já disse o que queria.
 *
 * O intervalo entre dois emojis é do servidor, que engole em silêncio o que vem
 * cedo demais. As teclas apagadas aqui são esse mesmo intervalo dito na tela: o
 * silêncio de lá seria a mesa parecer que perdeu a mensagem.
 */
export function EmotePicker({ onSend }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [cooling, setCooling] = useState(false);

  useEffect(() => {
    if (!cooling) return;
    const timer = setTimeout(() => setCooling(false), EMOTE_COOLDOWN);
    return () => clearTimeout(timer);
  }, [cooling]);

  const send = (emote: Emote) => {
    onSend(emote);
    setCooling(true);
    if (menu.current) menu.current.open = false;
  };

  return (
    <details ref={menu} className="fdp-emotes relative">
      <summary className="px-btn" aria-label="Falar com a mesa">
        🙂 falar
      </summary>

      <div className="px-slab fdp-emote-panel grid grid-cols-5 gap-1 p-2">
        {EMOTES.map((emote) => (
          <button
            key={emote}
            type="button"
            onClick={() => send(emote)}
            disabled={cooling}
            className="fdp-emote-key"
            aria-label={`Dizer ${emote}`}
          >
            {emote}
          </button>
        ))}
      </div>
    </details>
  );
}
