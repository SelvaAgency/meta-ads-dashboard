# Cabeças (PNG recortado) dos votantes — slide "Você prefere?"

Coloque aqui os PNGs recortados (sem fundo) das cabeças dos funcionários.
O nome do arquivo deve ser o **slug do nome do usuário** no sistema:

  minúsculas · sem acentos · espaços → hífen · sem caracteres especiais

Exemplos (Nome do sistema → arquivo):
  Giulia Motta        → giulia-motta.png
  Wictor Melo         → wictor-melo.png
  Nathan Yoles        → nathan-yoles.png
  Guilherme Felberg   → guilherme-felberg.png
  Bruna Anurb         → bruna-anurb.png
  Elizabeth Andrade   → elizabeth-andrade.png
  Felipe Machado      → felipe-machado.png
  Rafael Affonso      → rafael-affonso.png
  Natalia Ritzmann    → natalia-ritzmann.png

IMPORTANTE: o arquivo casa com o NOME COMPLETO cadastrado em Colaboradores.
Se um head não aparecer, confira se o nome no sistema gera exatamente o slug
do arquivo (ex.: o head "bruna-anurb.png" exige o nome "Bruna Anurb").

Servidos de client/public/, ficam em: /selvatv/voters/<slug>.png

A associação é AUTOMÁTICA: o slide gera o slug a partir do nome do usuário que
votou e tenta carregar /selvatv/voters/<slug>.png. Se o arquivo não existir,
cai no fallback de INICIAIS (com a borda na cor da opção votada).

Dica: use PNGs com fundo transparente e SEM borda embutida — a borda colorida
(rosa/azul, conforme a opção) é aplicada dinamicamente pelo app (contorno via
drop-shadow que segue a silhueta).
