import { useRef, type PointerEvent, type RefObject } from "react";
import { poseOfCard, type Pose } from "../game/flights";

/**
 * Abaixo disto o gesto ainda é um clique, não um arraste. Cinco pixels era
 * pouco: um clique comum treme mais que isso, e o gesto virava um arraste que
 * terminava fora do descarte — ou seja, nada acontecia e a carta parecia
 * travada. Vinte e quatro é o bastante para separar a intenção.
 */
const CLICK_SLOP = 24;

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
   */
  onDrop: (hit: boolean, from: Pose) => void,
  onOver?: (hit: boolean) => void,
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
    onOver?.(false);
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
      onOver?.(moved.current && isOverTarget(event.clientX, event.clientY));
    },

    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!origin.current) return;
      const element = event.currentTarget;
      const dropped = moved.current;
      const hit = isOverTarget(event.clientX, event.clientY);
      const from = poseOfCard(element);
      // Removing the class restores the transition, so the card animates back.
      cancel(element);
      // Arraste de verdade só joga se soltar no descarte. Gesto curto é
      // clique, e clique joga — quem usa teclado nunca vai arrastar.
      onDrop(dropped ? hit : true, from);
    },

    // The browser cancels the pointer on its own (system gesture, incoming
    // call). Without this the card stays glued to the cursor forever.
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      cancel(event.currentTarget);
    },
  };
}
