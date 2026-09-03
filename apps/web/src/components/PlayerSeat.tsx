import { cardLabel, type Card, type PublicPlayer } from "@fdp/shared";
import { anchorRef } from "../game/flights";
import type { Bubble } from "../game/useEmotes";
import { artUrl, cardOnSlab, cardShort } from "../lib/cards";
import { EmoteBubble } from "./EmoteBubble";
import { SpyPeek } from "./SpyPeek";

type Props = {
  player: PublicPlayer;
  active: boolean;
  isHost: boolean;
  /** Quem reparte esta rodada. */
  isDealer: boolean;
  /** Levou a última mão fechada. */
  wonTrick: boolean;
  /** A mesa está declarando promessas agora. */
  bidding: boolean;
  /**
   * A mão dele, aberta para você. Só existe na rodada às cegas, e é o que
   * substitui a sua própria carta como informação: você vê a de todo mundo,
   * menos a sua.
   */
  peek?: Card[];
  /**
   * A mão dele para quem ASSISTE — quem já saiu da mesa. Diferente do `peek`,
   * ela não fica exposta no assento: é a mão inteira, e desenhá-la em cada
   * assento sepultaria a mesa. Fica atrás de um olho. Ver `SpyPeek`.
   */
  spy?: Card[];
  /** O que ele está dizendo agora, enquanto o balão dura. */
  bubble?: Bubble;
};

export function PlayerSeat({
  player,
  active,
  isHost,
  isDealer,
  wonTrick,
  bidding,
  peek,
  spy,
  bubble,
}: Props) {
  // Está em cima da promessa agora. Verde não quer dizer bom para VOCÊ: quer
  // dizer que, se a rodada acabasse aqui, ele não perderia nada.
  const hitting = player.promise >= 0 && player.tricks === player.promise;

  return (
    <div
      ref={anchorRef(`seat:${player.id}`)}
      className={[
        // No celular o assento é uma faixa baixa: o nome numa linha, o placar
        // na outra. Com dez lugares na mesa é a altura da fileira que come a
        // tela, e o que sobra dela é a mesa. A largura não encolhe junto — o
        // nome precisa caber, e é ele que diz de quem é o assento.
        "fdp-seat flex w-32 flex-col items-center gap-1 px-2 py-1 text-center",
        "sm:px-3 sm:py-2",
        active && "fdp-seat-active",
        wonTrick && "fdp-seat-won",
        player.eliminated && "fdp-seat-out",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/*
        Quem é: o farol da conexão, as marcas de host e de quem reparte, e o
        nome. Tudo numa linha só, e sem quebra: a fileira de assentos é a altura
        que o celular não tem de sobra, e uma segunda linha aqui a dobraria.

        Não há contador de cartas. Todo mundo recebe a mesma quantidade, e o
        que cada um ainda tem na mão se lê no cabeçalho da rodada — repetir o
        mesmo número em dez assentos não dizia nada a ninguém.
      */}
      <span className="flex w-full flex-nowrap items-center justify-center gap-1 text-xs">
        <span
          className="inline-block size-2 shrink-0"
          style={{ background: player.connected ? "var(--live)" : "var(--gloss)" }}
          title={player.connected ? "conectado" : "desconectado"}
        />
        {isHost && (
          <span className="shrink-0" title="host">
            👑
          </span>
        )}
        {isDealer && (
          <span className="fdp-badge shrink-0" title="reparte esta rodada">
            D
          </span>
        )}
        {/* `min-w-0` para o nome poder encolher: sem ele um "Ana Beatriz" se
            recusa a cortar e estoura a largura do assento. */}
        <span
          className="min-w-0 truncate"
          title={player.name}
          style={{ color: "var(--paper-hi)" }}
        >
          {player.name}
        </span>
      </span>

      {/*
        A promessa dele, dita alto, e só enquanto a mesa está declarando: nessa
        etapa a única coisa que acontece é cada um dizer um número, e é ele que
        decide o que você vai prometer na sua vez. Depois disso ela vira o
        denominador discreto do placar logo abaixo — no meio das mãos o que
        importa é a DISTÂNCIA entre o feito e o prometido, e não o prometido.

        `key` no número: se ele mudar (uma cadeira que trocou de dono no meio da
        etapa), a pastilha salta de novo em vez de trocar o dígito parada.
      */}
      {bidding && !player.eliminated && player.promise >= 0 && (
        <b key={player.promise} className="fdp-call px-pop">
          faz {player.promise}
        </b>
      )}

      {/*
        O placar do assento: o que ele prometeu, o que já fez e o que lhe resta.
        Os três juntos são a única coisa que importa olhar num adversário —
        quem está prestes a estourar a promessa é quem você quer atrapalhar, e
        quem está com um ponto na mão é quem pode sair da mesa nesta rodada.
      */}
      {!player.eliminated && (
        <span className="fdp-score flex w-full items-center justify-center gap-2">
          <span title="mãos feitas / prometidas">
            <b style={{ color: hitting ? "var(--live)" : "var(--mark)" }}>{player.tricks}</b>
            <span style={{ color: "var(--gloss)" }}>/</span>
            <b style={{ color: "var(--paper-hi)" }}>
              {player.promise < 0 ? "?" : player.promise}
            </b>
          </span>
          <span style={{ color: "var(--gloss)" }}>·</span>
          <span title="pontos restantes" style={{ color: "var(--paper-sh)" }}>
            {player.points} pt
          </span>
        </span>
      )}
      {player.eliminated && <span className="fdp-score">fora da partida</span>}

      {/* O olho de quem assiste. Só ele o vê, e ele vê o de todos os que
          continuam de pé. */}
      {spy && spy.length > 0 && <SpyPeek name={player.name} cards={spy} />}

      {/*
        A mão dele, aberta: só acontece na rodada às cegas, e a rodada às cegas
        é de uma carta só — é sempre UMA carta por assento.

        De `sm` para cima ela vem desenhada, e grande: é a informação que
        substitui a sua própria carta na rodada inteira, e uma miniatura de
        unha não se lê de longe. No celular a arte não caberia em dez assentos
        sem virar borrão, então ela vira nome: `10♥` diz o mesmo em dois
        caracteres, e a tinta do naipe vai na cor.
      */}
      {peek && peek.length > 0 && (
        <>
          <span className="hidden items-end justify-center gap-1 pt-1 sm:flex">
            {peek.map((card) => (
              <img
                key={card.id}
                className="fdp-peek"
                src={artUrl(card)}
                alt={cardLabel(card)}
                title={cardLabel(card)}
              />
            ))}
          </span>
          <span className="flex items-baseline justify-center gap-2 pt-0.5 sm:hidden">
            {peek.map((card) => (
              <b
                key={card.id}
                className="fdp-peek-short"
                title={cardLabel(card)}
                aria-label={cardLabel(card)}
                style={{ color: cardOnSlab(card) }}
              >
                {cardShort(card)}
              </b>
            ))}
          </span>
        </>
      )}

      {/* Pendurado no assento, e não empilhado dentro dele: os balões vão e
          vêm a cada poucos segundos, e no fluxo normal cada um deles esticaria
          o assento e sacudiria a fileira inteira. A chave é o `seq`, para o
          mesmo emoji repetido saltar de novo em vez de ficar parado. */}
      {bubble && (
        <span className="absolute top-full left-1/2 z-20 -translate-x-1/2 pt-1">
          <EmoteBubble key={bubble.seq} emote={bubble.emote} />
        </span>
      )}
    </div>
  );
}
