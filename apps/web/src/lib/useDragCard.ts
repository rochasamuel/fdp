import { useRef, type PointerEvent, type RefObject } from "react";
import { poseOfCard, type Pose } from "../game/flights";

/** Onde o ponteiro está, na janela. */
export type Point = { x: number; y: number };

/**
 * Abaixo disto o gesto ainda é um clique, não um arraste. Cinco pixels era
 * pouco: um clique comum treme mais que isso, e o gesto virava um arraste que
 * terminava fora do descarte — ou seja, nada acontecia e a carta parecia
 * travada. Vinte e quatro é o bastante para separar a intenção.
 */
const CLICK_SLOP = 24;

/**
 * O ponto que não é ponto nenhum: o gesto acabou e não há mais ponteiro em
 * cima de coisa alguma. Fora da tela em vez de nulo para o `onOver` ter sempre
 * um ponto para ler.
 */
const OFFSCREEN: Point = { x: -1, y: -1 };

/**
 * Pointer Events instead of HTML5 drag-and-drop: the native drag image is a
 * bitmap the page cannot style, and touch needs a polyfill. `setPointerCapture`
 * covers mouse, touch and pen in one path.
 */
export function useDragCard(
  target: RefObject<HTMLElement | null>,
  /**
   * `from` é a pose em que a carta estava no instante em que a mão a soltou.
   * Medida antes de `cancel`, que devolve a carta ao leque — depois dele, um
   * arraste largado no descarte mediria o slot de origem, e um clique numa
   * carta da ponta mediria a horizontal em vez da inclinação do leque.
   *
   * `dragged` separa os dois gestos que chegam aqui. Levar a carta até a pilha
   * é deliberado — não escapa do dedo —, e é por isso que a confirmação do
   * celular vale só para o toque. Ver `needsConfirm` no `Hand`.
   *
   * `at` é onde o ponteiro estava quando soltou. Quem a usa é o leque: soltar
   * FORA do descarte não joga, e é aí que a carta troca de lugar na mão — o
   * ponto diz em cima de qual vizinha ela caiu. Ver `useReorder` no `Hand`.
   */
  onDrop: (hit: boolean, from: Pose, dragged: boolean, at: Point) => void,
  onOver?: (hit: boolean, at: Point) => void,
) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const offset = (element: HTMLElement, x: number, y: number) => {
    element.style.setProperty("--drag-x", `${x}px`);
    element.style.setProperty("--drag-y", `${y}px`);
  };

  const isOverTarget = (x: number, y: number) => {
    const box = target.current?.getBoundingClientRect();
    return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  };

  const cancel = (element: HTMLElement) => {
    origin.current = null;
    element.classList.remove("is-dragging");
    offset(element, 0, 0);
    onOver?.(false, OFFSCREEN);
  };

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      // The drag survives the pointer leaving the card.
      event.currentTarget.setPointerCapture(event.pointerId);
      origin.current = { x: event.clientX, y: event.clientY };
      moved.current = false;
      event.currentTarget.classList.add("is-dragging");
    },

    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!origin.current) return;
      const dx = event.clientX - origin.current.x;
      const dy = event.clientY - origin.current.y;
      if (Math.hypot(dx, dy) > CLICK_SLOP) moved.current = true;
      // Written straight to the style: one setState per pointermove would be
      // 60+ React renders a second to move one card.
      offset(event.currentTarget, dx, dy);
      onOver?.(moved.current && isOverTarget(event.clientX, event.clientY), {
        x: event.clientX,
        y: event.clientY,
      });
    },

    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!origin.current) return;
      const element = event.currentTarget;
      const dropped = moved.current;
      const hit = isOverTarget(event.clientX, event.clientY);
      const at = { x: event.clientX, y: event.clientY };
      const from = poseOfCard(element);
      // Arraste de verdade só joga se soltar no descarte. Gesto curto é
      // clique, e clique joga — quem usa teclado nunca vai arrastar.
      //
      // ANTES do `cancel`, e não depois: é o `cancel` que avisa o leque de que
      // o gesto acabou, e quem decide para onde a carta vai precisa da resposta
      // que estava na tela no instante em que a mão soltou.
      onDrop(dropped ? hit : true, from, dropped, at);
      // Removing the class restores the transition, so the card animates back.
      cancel(element);
    },

    // The browser cancels the pointer on its own (system gesture, incoming
    // call). Without this the card stays glued to the cursor forever.
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      cancel(event.currentTarget);
    },
  };
}
