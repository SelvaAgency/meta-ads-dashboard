# Modelo: Alertas · Recomendações · Saúde

> Definições ratificadas em **02/08/2026** para a revisão geral do BIT. Este doc é a
> referência das próximas fases — quando algo no código divergir daqui, o código é que
> está errado.

## O princípio

Três coisas que antes se misturavam, agora separadas **por natureza**. Cada uma tem
uma definição e **um lar canônico**.

| Conceito | O que é | Quem gera | O que faz |
|---|---|---|---|
| **Alerta** | Um **fato** que aconteceu e precisa de olhar | Regras (determinístico) | **Informa** |
| **Recomendação** | Uma **ação** sugerida para melhorar | IA (com raciocínio) | **Age** (aplicar/rejeitar) |
| **Saúde / Estado** | O **veredito-resumo** de uma conta | Um motor só | **Resume** |

Regra de ouro: **Alerta = fato · Recomendação = ação · Saúde = veredito.**

Um alerta crítico pode ser o *gatilho* que faz a IA produzir uma recomendação, e ambos
sobem para o veredito de saúde da conta — mas cada um continua com seu lar.

## Alerta

Um fato detectado por **regra** (nunca pela IA). Ex.: "site fora do ar", "saldo abaixo do
limite", "criativo reprovado", "ROAS caiu 40% vs. a média de 30 dias". Um alerta **informa**;
não diz a estratégia.

Só **dois níveis**, com critério objetivo:

- **Crítico** — dinheiro parando/queimando ou cliente exposto → merece interromper
  (topo da conta + e-mail quando o envio for religado).
- **Atenção** — degradou, precisa de olhar hoje, mas não é emergência.

(Existe também o estado **Sem dados**, quando não dá para avaliar — não é um alerta, é
ausência de sinal.)

**Lar:** uma caixa única de alertas/notificações (a unificar — hoje há `/alerts` do Tracker
e `/notificacoes` do Spaces sobre o mesmo backend). Os críticos também aparecem no topo da
conta.

## Recomendação

Uma **ação** sugerida pela IA para melhorar o resultado, com raciocínio. Ex.: "realoque
orçamento de X para Y", "teste criativo estático de produto isolado". Tem **prioridade**
(P1/P2/P3) e um **ciclo de vida**: pendente → aplicada/rejeitada → (em observação) → fechada.
Uma recomendação **age**.

**Lar:** o "Plano de Ação" por conta (onde se aplica/rejeita) e o agregado "Ações Sugeridas"
na Visão Geral. Aplicar/rejeitar vive só onde o plano vive.

## Saúde / Estado

O **veredito-resumo** de uma conta — um número, não uma lista. **Um** motor, **um**
vocabulário para todo o produto:

> **Saudável · Atenção · Crítico** (+ **Sem dados**)

Aposentar os vocabulários paralelos (A/B/C; Ok/Sem-dados) e unificar os ~5 motores de
classificação que hoje discordam entre si.

**Lar:** o cabeçalho da conta e a barra de saúde do portfólio na Visão Geral.

## Plano de fases

- **Fase 0 — faxina + definições** *(em andamento)*: remover código morto (sistema
  `anomalies`, caminho de monitoramento fantasma, toggles de alerta nunca lidos) e escrever
  este doc. Baixo risco.
- **Fase 1 — uma saúde só**: um motor + o vocabulário acima, consumido por todas as telas.
- **Fase 2 — fronteira Alerta/Recomendação + caixa única de alertas.**
- **Fase 3 — consertar o loop aplicar→monitorar** + decidir geração automática de
  recomendações (auto no cron × sob demanda × híbrido para contas críticas).

## Decisões já tomadas (02/08/2026)

1. Separar por natureza (fato/ação/veredito). ✅
2. Vocabulário único: Saudável/Atenção/Crítico (+ Sem dados). ✅
3. Unificar as duas caixas de notificação numa só. ✅ *(falta escolher qual UI vira base)*
