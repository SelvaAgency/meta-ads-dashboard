# Auditoria — por que o e-mail automático não chega

Levantada em 21/07/2026, contra o banco e as variáveis de **produção**.
Método: leitura do código + execução do código real contra o banco de produção
em dry-run + teste de autenticação SMTP + consulta ao histórico de envios.

---

## Veredito em uma linha

**Tudo funciona até a última linha.** O job roda, os destinatários resolvem
certo, o dedup não bloqueia, a trava de dry-run está desligada e a credencial
SMTP é válida. O que falha é a **entrega** — e `sendEmail` engole o erro num
`return false`, sem deixar registro em lugar nenhum.

---

## O número que fecha o diagnóstico

```sql
SELECT type, MAX(emailSentAt), COUNT(*) FROM alerts WHERE emailSentAt IS NOT NULL GROUP BY type;
→ TRELLO_DUE | 2026-07-15 17:13:55 | 6
```

**Seis e-mails. É o histórico inteiro do sistema.** Todos de 15/07 às 17:13,
antes da trava de dry-run existir (commit `0ae3743`, 16/07). De 16/07 até hoje:
**zero**, em **dois jobs independentes**.

A tabela `daily_digest_recipients` — que existe justamente para registrar envio
— está **vazia**.

---

## As 15 perguntas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Qual job deveria enviar? | **Dois.** `runNotificacoesSeForHora` (ciclo diário completo) e `runDailyReport` (relatório Meta legado, 06:03) |
| 2 | Está rodando em produção? | **Sim, provado.** Alerts `FINANCE_OVERDUE` nascem todo dia às 10:30 UTC, inclusive hoje |
| 3 | Horário e timezone? | **07:30 America/Sao_Paulo**, vindo do banco (`daily_digest_settings`), com `TZ` explícito no cron |
| 4 | Onde vive? | `node-cron` dentro do processo do app — [autoSync.ts:1086](server/autoSync.ts#L1086), iniciado em [_core/index.ts:143](server/_core/index.ts#L143) |
| 5 | Chama emailService ou só cria alerta? | **Chama de verdade**: `runFinanceAtrasos` → `enviarEmails` → `sendEmail` |
| 6 | Bloqueado por notification_settings? | **Não** para o financeiro (2 admins resolvem). **Sim** para o digest — ver Bug A |
| 7 | Bloqueado por EMAIL_DRY_RUN? | **Não.** Variável não definida + `NODE_ENV=production` → `isDryRun()` = false |
| 8 | Desviado por EMAIL_TEST_RECIPIENT? | **Não.** Não definida |
| 9 | SMTP disponível no runtime? | **Variáveis presentes e credencial válida** — autentiquei em `smtp.gmail.com:587` sem enviar nada |
| 10 | Dedup impedindo? | **Não.** `emailJaEnviado` = false para os dois admins hoje |
| 11 | Tabela que marca enviado? | `alerts.emailSentAt` + `daily_digest_recipients` (**vazia — nunca registrou nada**) |
| 12 | Financeiro cria alerta mas não e-mail? | Cria alerta ✓. Chega a chamar `sendEmail`, mas `emailSentAt` fica NULL → **`sendEmail` devolveu false** |
| 13 | Briefing existe e chama envio? | Existe (1.037 chars hoje, 51 alerts). Chama envio para 10 pessoas. Nenhum chegou |
| 14 | Diário/semanal separados do digest? | **Sim, quatro caminhos distintos** — parte do problema |
| 15 | Quais tipos precisam ir por e-mail? | Ver tabela de tipos abaixo |

### Prova de que os destinatários resolvem certo

Rodando o código de produção contra o banco de produção:

```
FINANCE_ATRASO:   email "hora" = 2  [felberg@, nathan@]   in-app = 2
RELATORIO_DIARIO: email "hora" = 10 [10 colaboradores]     in-app = 10
ANIVERSARIO:      email "hora" = 0                          in-app = 11
COMUNICADO:       email "hora" = 11                         in-app = 11
```

---

## Onde exatamente quebra

[emailService.ts:100-103](server/emailService.ts#L100-L103):

```ts
} catch (err) {
  console.error("[EmailService] ✗ Failed to send email:", err);
  return false;      // ← o erro morre aqui
}
```

Quem chama recebe só `false`. Não grava motivo, não grava tentativa, não grava
nada. O único vestígio é um `console.error` — e os logs do Railway são
**apagados a cada deploy**. Subi um deploy hoje às 12:58; o ciclo das 07:30 foi
junto.

**Isso é a causa-raiz do desconhecimento**, e é o que a Fase E1 conserta
primeiro: sem registro durável de tentativa, o sistema não consegue contar o que
deu errado.

### O que ainda não sei

**A mensagem exata que o Gmail devolve em produção.** Não vou afirmar que sei.
O que os fatos sustentam:

- a credencial é válida **de fora do Railway**;
- **dois jobs independentes** falham no mesmo ponto;
- portanto o problema é da **entrega**, não da lógica.

Suspeito nº 1: o Gmail recusando o IP de saída do Railway (`Try again later` /
`Unusual activity`). Suspeito nº 2: bloqueio de saída na porta 587. Nenhum dos
dois se confirma sem uma tentativa real registrada.

**Teste decisivo e seguro** (proposto, não executado):
definir `EMAIL_TEST_RECIPIENT=felberg@selva.agency` no Railway e disparar. Tudo
cai numa caixa só, ninguém mais é tocado, e o erro real aparece. Alinhado com a
sua regra de teste só para admin/dev.

---

## Bugs estruturais provados (independentes do SMTP)

### Bug A — o digest diário é estruturalmente vazio

`runDigestDiario` só inclui itens cujo dono escolheu **"no resumo do dia"**.

```sql
SELECT COUNT(*) FROM notification_prefs;  → 1
```

**Uma linha no sistema inteiro** (um usuário, tipo OPERACIONAL, off). E nenhum
default do catálogo é `"digest"` — são todos `"hora"` ou `"off"`.

Logo: **o digest sempre manda zero, por construção.** Nunca teve chance de
funcionar. É exatamente o que a regra por role elimina.

### Bug B — aniversário nunca vira e-mail

`ANIVERSARIO` tem `emailModo: "off"` no catálogo. In-app funciona para 11
pessoas; e-mail nunca sai.

### Bug C — endpoint público que dispara e-mail

`reports.sendDailyReport` é `publicProcedure` ([routers.ts:4015](server/routers.ts#L4015)).
Qualquer pessoa na internet dispara e-mail para 5 colaboradores, sem
autenticação. Fechar na E1.

### Bug D — ruído que não deveria existir

Últimos 14 dias: **231 `TRELLO_DUE`** e **129 `SYNC_COMPLETE`**. Trello duplica o
Trello; `SYNC_COMPLETE` não é notícia para ninguém.

---

## Tipos de alerta hoje — o que fica e o que sai

| Tipo | 14d | Vai para o e-mail? |
|---|---|---|
| `RELATORIO_DIARIO` | 51 | ✅ bloco Performance |
| `FINANCE_ATRASO` | 12 | ✅ bloco Financeiro — **só admin** |
| `ANOMALY` | 19 | ✅ só as críticas |
| `CLARITY_ISSUE` / `TRACKING_PROBLEM` | 14 | ✅ bloco Site, só crítico |
| `COMUNICADO` | 2 | ✅ quando houver |
| `ANIVERSARIO` | — | ✅ institucional |
| `WEEKLY_REPORT` | 10 | ➖ segue separado |
| `TRELLO_DUE` / `TRELLO_RECONNECT` | 231 | ❌ duplica o Trello |
| `SYNC_COMPLETE` | 129 | ❌ ruído |
| `SYNC_ERROR` / `BUDGET_WARNING` | 51 | ❌ in-app apenas |

---

## Plano de correção

### Fase E1 — fazer o e-mail sair, e provar que saiu
1. `dailyDigestService.ts` — um digest por pessoa, conteúdo filtrado por role.
2. **Registrar toda tentativa** em `daily_digest_recipients`: `sent` / `dry_run`
   / `failed` + mensagem de erro. Fim do erro invisível.
3. `sendEmail` passa a devolver o erro, não só `false`.
4. Dedup pelo recibo (`daily_digest_recipients`), não por `alerts.emailSentAt` —
   funciona mesmo quando não há alerta.
5. Fechar o endpoint público (Bug C).
6. Aposentar os quatro caminhos paralelos em favor de um.

### Fase E2 — regra por role no lugar da preferência pessoal
- Matriz fixa admin / developer / user.
- Financeiro só admin, checado no servidor (não só na UI).
- Tela de preferências vira informativa para quem não é admin.

### Fase E3 — diagnóstico e disparo assistido
- Painel: último envio, destinatários, enviados, falhados, próximo agendamento.
- Botão "Enviar agora" com prévia de alcance e confirmação.
- Disparo manual **só para admin/dev**, assunto com `[TESTE]`.

---

## Referência de ambiente (produção, 21/07)

```
NODE_ENV=production          EMAIL_DRY_RUN=(não definida)
SMTP_HOST=smtp.gmail.com     EMAIL_TEST_RECIPIENT=(não definida)
SMTP_PORT=587                SMTP_USER=contato@selva.agency
daily_digest_settings: autoEnabled=1, defaultTime=07:30, tz=America/Sao_Paulo
usuários ativos: 2 admin · 1 developer · 8 user (todos com e-mail)
```

---

## RESOLVIDO — a causa real (21/07, teste dentro do container de produção)

Acessei o container de produção via `railway ssh` e testei a rede de dentro.

```
CONTROLE https googleapis          → 204          ✅ a saída funciona
tcp www.googleapis.com:443 (v4)    → CONECTOU     ✅
tcp smtp.gmail.com:587  (v4)       → TIMEOUT      ❌
tcp smtp.gmail.com:465  (v4)       → TIMEOUT      ❌
tcp smtp.gmail.com:25   (v4)       → TIMEOUT      ❌
tcp smtp.gmail.com:2525 (v4)       → TIMEOUT      ❌
tcp smtp-relay.gmail.com:587 (v4)  → TIMEOUT      ❌
```

**O Railway bloqueia portas SMTP de saída.** É política da plataforma contra
abuso de spam. HTTPS sai normalmente — por isso Meta, Google Ads e Clarity
sempre funcionaram, e só o e-mail nunca funcionou.

Isso explica cada fato da auditoria sem sobrar nada:

- a credencial autentica **de fora** do Railway (meu ambiente) — e falha dentro;
- **dois jobs independentes** falham no mesmo ponto;
- os únicos 6 e-mails da história são de 15/07, disparados **do terminal**, fora
  do Railway — exatamente o que estava sendo chamado de "teste do SMTP funciona".

Um detalhe secundário apareceu junto: o container não tem rota IPv6, e o Node
resolve `smtp.gmail.com` para IPv6 primeiro — daí o `ENETUNREACH`. Mesmo
forçando IPv4 o resultado é timeout, então o bloqueio de porta é a causa
dominante; o IPv6 só mascarava a mensagem.

### Consequência

**Nenhuma correção de código faz o SMTP sair do Railway.** O envio precisa
trocar de transporte: uma API de e-mail sobre **HTTPS**, que é o que a
plataforma deixa passar.

Todo o trabalho da E1 continua válido — `email_send_log`, uma entrega por
destinatário, erro real registrado, `[TESTE]` e desvio por lista. Só a última
milha (`nodemailer` → SMTP) é que precisa virar chamada HTTPS.
