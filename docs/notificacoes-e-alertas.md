# Notificações e Alertas

> Levantado do código e do banco de produção em **15/07/2026**. Escrito para decidir o
> que fazer a seguir — a última seção é a que importa.

---

## Estado agora, em produção

| | |
|---|---|
| Domínios | 4 |
| Tipos | 9 |
| Notificações na base | 422 |
| Não lidas | 228 |
| Preferências salvas | **0** |

As 228 não lidas não são novidade: são backlog que já existia e só ficou visível porque
dispensar deixou de apagar a linha. E ninguém tem preferência salva — todo mundo está no
default do catálogo, ou seja, a matriz de configuração ainda não foi usada por ninguém.

---

## Como funciona

Uma notificação é **uma linha por destinatário**. O gatilho descobre quem deve receber e cria
uma cópia para cada pessoa — por isso cada um lê e dispensa a sua, e o financeiro consegue ser
realmente restrito a admin: as linhas simplesmente não existem para os outros.

Tudo mora na tabela `alerts`, que já existia e foi estendida (nunca recriada). Cada linha tem:

- **domínio** — a área (Performance · Financeiro · Tarefas · Comunicado)
- **tipo** — a unidade que a pessoa configura
- **chave de dedup** — normalmente `tipo:referência:dia`, que impede o cron de repetir o mesmo
  aviso duas vezes no mesmo dia

**Comunicado não tem tabela de recibo.** A tabela `comunicados` guarda só o conteúdo e o autor.
A entrega e o "quem leu" são as próprias linhas de `alerts` — quem leu é literalmente o `isRead`
de cada destinatário. Uma fonte de verdade, não duas que podem divergir.

### Arquivos

| O quê | Onde |
|---|---|
| Catálogo de tipos e domínios | `shared/notifications.ts` |
| Gatilhos (Trello, financeiro, digest, comunicado) | `server/notificationJobs.ts` |
| Agendamento no cron | `server/autoSync.ts` |
| Camada de dados | `server/db.ts` |
| Tela pessoal | `client/src/pages/hub/NotificacoesPage.tsx` |
| Tela de mídia | `client/src/pages/AlertsPage.tsx` |
| Preferências | `client/src/pages/Settings.tsx` |

---

## As três telas

| Tela | Para quem | O que é |
|---|---|---|
| **/notificacoes** | todos · sidebar do hub | Caixa de entrada pessoal. Tudo que é seu, de qualquer domínio. Admin tem a aba Enviados, com o compositor de comunicado e o recibo de leitura. |
| **/alerts** | todos · área de performance | Tela operacional de mídia: anomalias, token expirado, conta sem entrega. É de quem opera as contas, não do time inteiro. |
| **Configurações → Notificações** | todos · cada um o seu | Matriz tipo × canal. Por tipo, você escolhe se aparece no app e como o email sai. |

---

## Catálogo

| Domínio | Tipo | O que é | No app | Email |
|---|---|---|---|---|
| Comunicado | `COMUNICADO` | Aviso do admin, com público e recibo | sempre | na hora |
| Comunicado | `ANIVERSARIO` | Aniversário de alguém do time | sim | off |
| Tarefas | `TRELLO_PRAZO` | Card seu vencido / vence hoje / amanhã | sim | off |
| Tarefas | `TRELLO_RECONEXAO` | O acesso ao Trello expirou | sempre | na hora |
| Performance | `RELATORIO_DIARIO` | Resumo curto das contas | sim | na hora |
| Performance | `RELATORIO_SEMANAL` | Consolidado por conta, segundas | sim | na hora |
| Performance | `ANOMALIA` | ROAS, CPA, CTR, entrega, resultados | sim | off |
| Performance | `OPERACIONAL` | Token, sync, conta sem campanha | sim | off |
| Financeiro | `FINANCE_ATRASO` | A receber e a pagar vencidos | sim | na hora |

**Financeiro só existe para admin** — não aparece nem na configuração dos outros, e há teste
automatizado garantindo isso (`server/testFinanceAccess.ts`).

**"Sempre"** significa que o in-app não é opcional: comunicado e pedido de reconexão são
mensagens dirigidas a você, não ruído de sistema. Só o email deles é configurável.

---

## Email: off · na hora · no resumo do dia

Cada pessoa escolhe, por tipo, entre três modos. O **digest** é o que protege a caixa de entrada:
sem ele, cada prazo de card viraria um email. Quem escolhe digest recebe **um email por dia**,
agrupado por domínio, com tudo que nasceu naquele dia.

O envio sai de `contato@selva.agency` e é idempotente: cada linha guarda quando o email saiu,
então rodar o ciclo de novo não reenvia. Sem SMTP configurado, o email é pulado em silêncio e o
app segue funcionando.

---

## O que roda de manhã

| Horário (BRT) | Job | O que faz |
|---|---|---|
| 05:55 | `runAnomalyDetection` | Alertas técnicos: token, saldo baixo |
| 06:00 | `runAutoSync` | Sincroniza as contas de mídia |
| 06:20 | `runAnomaliasDeMidia` | ROAS, CPA, CTR — janelas de 7/14/30 dias |
| 06:25 | `runNotificacoesDiarias` | Financeiro → Trello → aniversários → briefing → semanal (seg) → digest |

Os gatilhos rodam em sequência e são **isolados**: um falhando não derruba os outros nem o
digest, que roda por último justamente para juntar o que os anteriores acabaram de criar. Tudo
aparece no log com o prefixo `[Notif]`.

---

## O que estava quebrado e foi consertado

Nada disso estava no plano — apareceu no caminho. Vale saber que existia, porque explica
comportamentos antigos que talvez tenham incomodado sem nunca terem sido diagnosticados.

- **Dispensar um alerta apagava a linha.** O nome era "marcar como lida", mas fazia `DELETE`.
  Não existia estado "lida" — e o histórico sumia para sempre.
- **O alerta dispensado voltava.** Consequência do anterior: o dedup procurava um alerta
  não-lido igual; como a linha tinha sido apagada, não achava nada e recriava tudo no ciclo
  seguinte. Você fechava, e ele voltava.
- **A detecção de anomalias nunca rodava sozinha.** Só disparava se alguém apertasse o botão na
  tela. O cron "de anomalias" só fazia alertas técnicos.
- **A validação em 7/14/30 dias não validava nada.** As três janelas recebiam a mesma média,
  então "confirmado em 2 de 3" era sempre 0/3 ou 3/3 — o filtro que existe para evitar alarme
  falso estava desligado.
- **O relatório semanal automático era falso.** O cron montava os dados com gasto, impressões e
  conversões **zerados** e mandava isso para o LLM. Só o "executar agora" manual usava números
  reais.
- **A tabela não tinha índice nenhum** além da chave primária, apesar de toda leitura filtrar
  por usuário e ordenar por data.

---

## Pontos a melhorar

Em ordem de quanto custa deixar como está.

### 🔴 QUEBRADO — O relatório diário nunca chega

Zero notificações desse tipo em todo o histórico. São dois problemas somados: o cron chama o
gerador com um stub que sempre devolve vazio (`runBriefingDiario(async () => null)` em
`autoSync.ts`), e a busca usa um usuário arbitrário (o primeiro da lista de email) enquanto o
briefing é gravado por pessoa — o de hoje é do Guilherme, mas o job procura o do `contato`.
Ou seja: mesmo se o gerador funcionasse, ele olharia no lugar errado.

**Como resolver:** o conteúdo do briefing é global (fala de todas as contas), então não deveria
ser gravado por usuário. Gerar uma vez com chave única do dia e notificar todo mundo a partir dela.

### 🔴 QUEBRADO — Frequência alta nunca dispara

O detector sabe avaliar frequência, mas o valor chega sempre como zero e as janelas de
comparação não trazem esse dado. O alerta existe no código (`FREQUENCY_HIGH` em
`analysisService.ts`) e é inalcançável na prática.

**Como resolver:** incluir frequência e alcance na agregação das janelas, junto com o resto.

### 🟠 RUÍDO — 189 avisos de "sincronização concluída" não lidos

É o maior volume de tudo e não é notícia para ninguém — sync que deu certo é o esperado. Isso
sozinho responde por **83% do backlog não lido** e é o que faz o sino parecer sempre cheio.

**Como resolver:** parar de criar notificação para sync bem-sucedido (virar log), e limpar o
histórico existente numa tacada.

### 🟠 RUÍDO — Nada expira

A tabela só cresce: 134 erros de anúncio, 32 de sync, todos acumulados desde sempre. Agora que
dispensar não apaga mais, isso cresce mais rápido do que antes.

**Como resolver:** um expurgo no cron — lida e com mais de 30/60 dias, sai. Já existe um job de
limpeza de anomalias que serve de modelo.

### 🟠 DÍVIDA — O horário do cron depende de sorte

Nenhum agendamento declara fuso. Os horários acima só batem porque o container roda em UTC por
acaso — o Railway não define fuso nenhum. Se alguém setar `TZ` um dia, tudo desloca três horas
sem aviso.

**Como resolver:** passar o fuso explicitamente em cada agendamento. É uma linha por job.

### 🟠 DÍVIDA — Duas configurações de notificação na mesma tela

A matriz nova (tipo × canal) convive com quatro interruptores antigos de CPA / ROAS / token /
orçamento, que têm os próprios limites numéricos e não conversam com o catálogo. Quem abrir a
tela vê dois sistemas e não sabe qual manda.

**Como resolver:** os limites (CPA acima de X, ROAS abaixo de Y) são úteis e devem ficar; o que
sobra são os liga/desliga duplicados. Migrar os quatro para o catálogo e deixar só os limites.

### 🟠 DÍVIDA — Clicar numa notificação não leva a lugar nenhum

Só o prazo do Trello tem link (vai para o card). Comunicado, atraso financeiro e anomalia são
becos sem saída: a pessoa lê e precisa achar o caminho sozinha.

**Como resolver:** guardar o destino junto da notificação — atraso abre o Financeiro no mês
certo, anomalia abre a conta.

### ⚪ DÍVIDA — Duas telas para o mesmo dado

`/alerts` e `/notificacoes` leem a mesma tabela com regras diferentes de agrupamento e filtro.
Hoje se justifica — uma é operação de mídia, a outra é pessoal — mas é a mesma coisa em dois
lugares, e vai divergir com o tempo.

**Como resolver:** decidir se `/alerts` vira uma visão filtrada de `/notificacoes` ou se assume
de vez o papel de painel operacional por conta.

### ⚪ RISCO — Prazo do Trello não tem teto

Hoje são 32 no total e está tranquilo. Mas quem tiver 200 cards vencidos recebe 200 notificações
de uma vez — não há limite por pessoa.

**Como resolver:** agrupar por pessoa ("12 cards vencidos") em vez de uma por card, ou cortar no
topo N mais atrasados.

### 🩷 OPORTUNIDADE — A tela de Tarefas continua morta

O item está na sidebar marcado como "em breve" e a integração do Trello já entrega quadro, lista,
etiquetas e prazo de tudo — sob demanda, sem cache. É a tela mais barata que sobrou para construir.

### 🩷 OPORTUNIDADE — Ninguém configurou nada ainda

Zero preferências salvas: todo mundo está no default. Se o digest e os modos de email forem para
ficar, vale avisar que existem — a matriz está escondida dentro de Configurações e não há nada
indicando o caminho.

---

*Os números de "estado agora" incluem o comunicado de teste enviado em 15/07 e os 32 prazos reais
do Trello.*
