import { useEffect, useRef, useState } from "react";
import { STARTER_SPIN, type PublicPlayer } from "@fdp/shared";
import { useSound } from "../lib/sound";
import { isLowMotion } from "../store/ui";

type Props = {
  /** A mesa, na ordem dos assentos: é por ela que o rolo passa. */
  players: PublicPlayer[];
  /** Quem o servidor tirou. O rolo gira até ele e para. */
  winnerId: string;
};

/**
 * Meio segundo com o nome parado antes de as cartas saírem. O sorteio precisa
 * ser lido, e a última coisa que a volta faz não pode ser o reparto começando
 * por cima dela.
 */
const REST = 500;

/**
 * A roleta do sorteio, por cima do lobby e da tela de fim de partida.
 *
 * Ela não decide nada: o vencedor chega pronto do servidor, e é o servidor que
 * conta o tempo da volta (`STARTER_SPIN`). O que este componente faz é gastar
 * esse tempo passando por todos os nomes até parar no que já estava escolhido —
 * é a mesma mesa que todo mundo vê, na mesma volta.
 */
export function StarterRoulette({ players, winnerId }: Props) {
  const winner = Math.max(0, players.findIndex((player) => player.id === winnerId));
  const showing = useSpin(players.length, winner);
  const landed = showing === null;
  const name = players[landed ? winner : showing]?.name ?? "";

  return (
    <div className="fixed inset-0 z-50 grid place-content-center bg-black/70 p-4">
      <div className="px-slab flex flex-col items-center gap-4 p-8 text-center">
        <p className="px-label">Sorteio</p>

        <div className="fdp-roulette">
          <span className={`fdp-roulette-mark ${landed ? "px-caret" : ""}`}>▶</span>
          <span
            // A remontagem a cada parada é o que dispara o salto: a peça entra
            // como um sprite, no mesmo tempo do resto da interface.
            key={landed ? "drawn" : showing}
            className={`fdp-roulette-name ${landed ? "is-drawn px-pop" : ""}`}
          >
            {name}
          </span>
          <span className={`fdp-roulette-mark ${landed ? "px-caret" : ""}`}>◀</span>
        </div>

        <p className="px-label">
          {landed ? (
            "começa a partida"
          ) : (
            <>
              quem começa<span className="px-caret">▌</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * A volta: o índice do nome em exibição, ou `null` quando ela acabou.
 *
 * Troca de nome em quadros e não num deslize contínuo — a mesa inteira é
 * desenhada assim (ver os `steps()` do index.css), e um rolo macio seria o
 * único movimento suave da tela. O rolo começa `ticks` nomes ANTES do sorteado
 * e anda um por quadro, então a última troca cai exatamente nele: a parada é
 * consequência da conta, e não um salto para o resultado no fim.
 */
function useSpin(playerCount: number, winner: number): number | null {
  const [tick, setTick] = useState(0);
  const play = useSound();
  const gaps = spinGaps(playerCount);

  useEffect(() => {
    if (reducedMotion()) return setTick(gaps.length);

    let timer: ReturnType<typeof setTimeout>;
    const step = (i: number) => {
      if (i >= gaps.length) return;
      timer = setTimeout(() => {
        setTick(i + 1);
        step(i + 1);
      }, gaps[i]);
    };
    step(0);
    return () => clearTimeout(timer);
    // A volta é uma só, do começo ao fim: refazer a corrente no meio dela
    // recomeçaria o giro. `gaps` não muda porque a mesa está trancada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const landed = tick >= gaps.length;
  const announced = useRef(false);

  // A parada tem som, uma vez só — `play` troca de identidade quando alguém
  // liga ou desliga o som, e sem a trava a roleta tocaria de novo no meio.
  useEffect(() => {
    if (!landed || announced.current) return;
    announced.current = true;
    play("turn");
  }, [landed, play]);

  if (landed) return null;
  // Módulo positivo: o rolo começa atrás do sorteado, e o índice de partida é
  // negativo antes de dar a volta.
  const count = Math.max(1, playerCount);
  return (((winner - gaps.length + tick) % count) + count) % count;
}

/**
 * Os intervalos entre um nome e o seguinte, em ms. Crescem em rampa e somam a
 * volta inteira: começa borrado, desacelera e para. Os pesos partem de 3, e não
 * de 1, porque o primeiro intervalo de uma rampa que começa em 1 fica abaixo de
 * um quadro de tela — quadros que ninguém chega a ver só encurtam a volta.
 */
function spinGaps(playerCount: number): number[] {
  const ticks = Math.max(14, playerCount * 2);
  const weights = Array.from({ length: ticks }, (_, i) => i + 3);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => ((STARTER_SPIN - REST) * weight) / total);
}

/* O sistema ou a chave da mesa: ver `isLowMotion` no store/ui. */
const reducedMotion = isLowMotion;
