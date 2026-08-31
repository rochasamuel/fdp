import { defineServer, defineRoom, matchMaker } from "colyseus";
import cors from "cors";
import { TableRoom } from "./rooms/TableRoom.js";

/**
 * Quem pode falar com este servidor: `CORS_ORIGIN`, separada por vírgula.
 * Vazia ou ausente, `null` — e aí qualquer origem passa.
 */
const ALLOWED = parseOrigins(process.env.CORS_ORIGIN);

/*
 * O matchmaking do Colyseus NÃO passa pelo middleware do express: ele tem
 * roteador próprio, e monta os cabeçalhos de CORS a partir deste método. O
 * padrão dele ecoa qualquer `Origin` que chegue, então sobrescrevê-lo é a única
 * forma de a variável valer alguma coisa nas rotas que importam — que são
 * justamente `joinById`, `create` e `reconnect`.
 *
 * Para recusar é preciso mandar um cabeçalho, e não omiti-lo: o que este método
 * devolve é mesclado POR CIMA de `DEFAULT_CORS_HEADERS`, que já traz `*`.
 * Omitir deixaria o `*` de pé e liberaria justamente quem se quer barrar.
 *
 * O valor da recusa é a primeira origem da lista — qualquer origem que não seja
 * a de quem pediu bloqueia, e essa é, por definição, diferente dela. Um `"null"`
 * literal pareceria mais explícito e seria pior: `Origin: null` é o que um
 * iframe em sandbox manda, e ele passaria a casar.
 */
matchMaker.controller.getCorsHeaders = (headers): Record<string, string> => {
  const origin = headers.get("origin");
  if (!ALLOWED) return { "Access-Control-Allow-Origin": origin || "*" };
  const allowed = origin !== null && ALLOWED.includes(origin);
  return { "Access-Control-Allow-Origin": allowed ? origin : ALLOWED[0] };
};

export default defineServer({
  rooms: {
    table: defineRoom(TableRoom),
  },

  // The web app is served from another origin in development, and matchmaking
  // goes over plain HTTP before the WebSocket is opened.
  //
  // Vale para o que o express serve por conta própria; o matchmaking se governa
  // pelo `getCorsHeaders` acima. Os dois leem a mesma lista de propósito.
  express: (app) => {
    app.use(cors({ origin: ALLOWED ?? true }));
  },
});

/**
 * A lista vira array, e não string: o `cors` só percorre arrays. Uma string ele
 * compara por igualdade exata contra o cabeçalho `Origin`, então
 * `"https://a.com,https://b.com"` não casaria com nenhuma das duas.
 */
function parseOrigins(value: string | undefined): string[] | null {
  const origins = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : null;
}
