# Assets do slide "Você prefere?" (SELVA TV)

Coloque nesta pasta:

- `giulia-motta.png`  → rosto recortado usado no slide (obrigatório p/ aparecer)
- `voce-prefere-reference.png` → APENAS referência visual sua; o app NÃO usa.

Servidos de `client/public/`, ficam em:
- `/selvatv/giulia-motta.png`
- `/selvatv/voce-prefere-reference.png`

O componente do slide usa `/selvatv/giulia-motta.png`. Enquanto o arquivo não
existir, o slide renderiza normalmente (só o rosto fica sem imagem) e o build
não quebra.
