import { SUITS, SUIT_NAME } from "@fdp/shared";
import { SUIT_HEX } from "../lib/cards";

/**
 * Toda linha do log fala de cartas, e carta se identifica pelo naipe: "dama de
 * copas", "ás de paus". Pintar a palavra é o que deixa a história legível de
 * relance — o log continua sendo texto puro no servidor, e é aqui, na leitura,
 * que a tinta volta a existir.
 */
const HEX_BY_NAME = new Map(SUITS.map((suit) => [SUIT_NAME[suit], SUIT_HEX[suit]]));
const SUIT_WORD = new RegExp(`(${[...HEX_BY_NAME.keys()].join("|")})`, "g");

export function SystemLog({ messages }: { messages: string[] }) {
  return (
    <div className="px-slab hidden w-64 flex-col gap-2 p-3 md:flex">
      <p className="px-label">Mesa</p>
      <ul
        className="flex max-h-28 flex-col-reverse gap-0.5 overflow-y-auto text-xs"
        style={{ color: "var(--paper-sh)" }}
      >
        {[...messages].reverse().map((message, index) => (
          <li key={`${messages.length - index}-${message}`}>
            {index === 0 && (
              <span className="px-caret" style={{ color: "var(--mark)" }}>
                ▌
              </span>
            )}
            {paint(message)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O `split` com grupo devolve os pedaços e os naipes intercalados, nesta ordem. */
function paint(message: string) {
  return message.split(SUIT_WORD).map((part, index) => {
    const hex = HEX_BY_NAME.get(part);
    return hex ? (
      <b key={index} style={{ color: hex }}>
        {part}
      </b>
    ) : (
      part
    );
  });
}
