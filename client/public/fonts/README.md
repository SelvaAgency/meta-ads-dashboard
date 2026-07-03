# Fontes locais do slide "Você prefere?" (SELVA TV)

Coloque os arquivos EXATAMENTE com estes nomes nesta pasta:

- `AkiraExpandedDemo.otf`        → usada no título "VOCÊ PREFERE?"
- `AtkinsonHyperlegible-Regular.ttf` → usada nos textos das opções

Como são servidas de `client/public/`, ficam disponíveis em:
- `/fonts/AkiraExpandedDemo.otf`
- `/fonts/AtkinsonHyperlegible-Regular.ttf`

Os `@font-face` já estão registrados em `client/src/index.css`.
Enquanto os arquivos não existirem, o app usa fallback (Montserrat / DM Sans)
e o build NÃO quebra. Assim que você adicionar os arquivos, as fontes reais são
usadas automaticamente (sem rebuild de código, só recarregar).

Obs.: verifique a licença das fontes antes de commitar os arquivos.
