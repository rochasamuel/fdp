/**
 * O pano da mesa. Cinco, e todos do mesmo valor de cinza: a carta, o texto
 * creme e o rosa da ênfase têm de ler igual sobre qualquer um deles — trocar de
 * pano é trocar de mesa, não de interface.
 *
 * A cor mora no CSS (`--felt-*` em index.css) e chega ao `body` por um
 * `data-felt` no <html>. Aqui ficam só a lista e os nomes, que é o que a tela
 * precisa para desenhar a fileira de amostras.
 */
export const FELTS = [
  { key: "green", label: "Verde" },
  { key: "burgundy", label: "Vinho" },
  { key: "navy", label: "Marinho" },
  { key: "charcoal", label: "Grafite" },
  { key: "walnut", label: "Nogueira" },
] as const;

export type Felt = (typeof FELTS)[number]["key"];

export const DEFAULT_FELT: Felt = "green";

export const isFelt = (value: unknown): value is Felt =>
  FELTS.some((felt) => felt.key === value);

/** Um atributo no <html> e o CSS inteiro segue. Ver `--felt` no index.css. */
export const applyFelt = (felt: Felt) =>
  document.documentElement.setAttribute("data-felt", felt);
