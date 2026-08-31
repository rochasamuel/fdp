# Referencia

Herdado do gerador de cartas de UNO do projeto `nuo`. Nada aqui entra no build
do baralho de FDP -- fica so como consulta.

- `symbols.py` — simbolos de acao do UNO (skip, reverse, +2, +4, roda de cores).
  O baralho frances nao tem cartas de acao, entao nenhum deles e usado. Vale
  como referencia de como um simbolo procedural (o anel do skip) e escrito no
  mesmo dialeto dos bitmaps.
- `uno_card.md` — diretivas de sombra e animacao em React validadas no demo do
  nuo. Continua valendo palavra por palavra para FDP: mesma grade de 64x96,
  mesmo SVG sem width/height, mesma sombra em CSS em vez de assada no arquivo.
  E de onde saem as regras que o `demo.html` daqui aplica.
