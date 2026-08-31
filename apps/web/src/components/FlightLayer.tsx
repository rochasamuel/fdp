import { useFlightStore } from "../game/flights";

/**
 * As cartas que estão no ar. Vive por cima da mesa inteira, em `fixed`, então
 * as coordenadas que `flights.ts` mede com `getBoundingClientRect` servem
 * direto — sem conversão de `offsetParent`, que é onde esse tipo de animação
 * costuma quebrar quando um contêiner ganha `transform`.
 *
 * Não recebe cliques e não tem conteúdo para leitores de tela: é o mesmo baralho
 * que a mesa já mostra, só que a caminho.
 */
export function FlightLayer() {
  const flights = useFlightStore((state) => state.flights);

  if (flights.length === 0) return null;

  return (
    <div className="fdp-flights" aria-hidden="true">
      {flights.map((flight) => {
        const timing = {
          animationDuration: `${flight.ms}ms`,
          animationDelay: `${flight.delay}ms`,
        };
        return (
          <div
            key={flight.id}
            className="fdp-flight"
            style={{
              left: `${flight.x}px`,
              top: `${flight.y}px`,
              width: `${flight.width}px`,
              "--dx": `${flight.dx}px`,
              "--dy": `${flight.dy}px`,
              "--rot": `${flight.rot}deg`,
              "--lift": flight.lift,
              "--land": flight.scale,
              ...timing,
            } as React.CSSProperties}
          >
            {/*
              Dois elementos, um eixo cada: o de fora anda em X num ritmo
              constante, o de dentro faz o Y com uma curva que sai para trás
              antes de cair. Curvas diferentes nos dois eixos = arco, sem
              `offset-path` e sem uma única linha de JavaScript por quadro.
            */}
            <div
              className={`fdp-flight-arc ${flight.near ? "is-near" : ""}`}
              style={timing}
            >
              <img className="fdp-card" src={flight.art} alt="" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
