/**
 * Uma lista de ouvintes e o jeito de avisá-los — o Observer, sem cerimônia.
 *
 * Para o que acontece num instante e passa: um evento de animação, um emoji.
 * Guardar isso em estado do React obrigaria quem consome a limpar a fila, com
 * a corrida de sempre entre esvaziar e receber.
 */
export function createEmitter<T>() {
  const handlers = new Set<(value: T) => void>();
  return {
    /** Assina. Devolve a função que cancela a assinatura. */
    on(handler: (value: T) => void) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit(value: T) {
      for (const handler of handlers) handler(value);
    },
  };
}
