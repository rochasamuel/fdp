import type { Emote } from "@fdp/shared";

/**
 * O que alguém acabou de dizer, à vista de quem disse.
 *
 * Sai da chapa como qualquer outra peça, e salta ao nascer: a mesa não tem
 * histórico de conversa, então aparecer É o aviso — quem estava olhando para a
 * própria mão precisa notar pelo canto do olho.
 *
 * `pointer-events-none` porque ele nasce por cima do assento, e um balão nunca
 * pode ser o que cobre o botão que decide a jogada de alguém.
 */
export function EmoteBubble({ emote }: { emote: Emote }) {
  return (
    <span
      role="status"
      className="px-slab px-pop pointer-events-none flex size-9 items-center justify-center text-xl leading-none"
    >
      {emote}
    </span>
  );
}
