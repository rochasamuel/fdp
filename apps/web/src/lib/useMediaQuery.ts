import { useMemo, useSyncExternalStore } from "react";

/**
 * Uma media query que o JavaScript também precisa saber.
 *
 * Quase tudo que muda com a largura da tela é o CSS quem resolve. A mesa
 * redonda não: ela precisa das contas das posições, e uma conta feita para uma
 * tela grande numa tela pequena não é um enfeite fora do lugar, é um assento
 * em cima do outro. Então o corte de largura mora aqui, num lugar só, e o CSS
 * segue a classe que este resultado liga.
 */

/**
 * Uma `MediaQueryList` por pergunta, para a vida toda da página.
 *
 * O `useSyncExternalStore` lê o valor a cada render e a cada aviso da loja, e
 * abrir uma media query nova em cada leitura é pedir ao navegador que analise
 * a mesma pergunta dezenas de vezes por jogada. Pior era a assinatura: um
 * `subscribe` diferente a cada render faz o React desligar e religar o
 * ouvinte, e a mesa redesenha a cada carta que cai.
 */
const lists = new Map<string, MediaQueryList | null>();

function listOf(query: string) {
  let list = lists.get(query);
  if (list === undefined) {
    list = typeof matchMedia === "function" ? matchMedia(query) : null;
    lists.set(query, list);
  }
  return list;
}

export function useMediaQuery(query: string) {
  const [subscribe, snapshot] = useMemo(() => {
    const list = listOf(query);
    return [
      (onChange: () => void) => {
        list?.addEventListener("change", onChange);
        return () => list?.removeEventListener("change", onChange);
      },
      () => list?.matches ?? false,
    ] as const;
  }, [query]);

  return useSyncExternalStore(subscribe, snapshot, () => false);
}
