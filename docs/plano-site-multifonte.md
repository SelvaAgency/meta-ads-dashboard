# Aba Site + Dashboard multi-fonte — inventário e proposta

Levantamento de 21/07/2026, feito no código e conferido contra o banco de
produção. **Nada foi implementado.** Este documento responde as 17 perguntas
antes de qualquer linha de código.

---

## Resumo em três frases

1. O material de reuso é **muito maior** do que parece: existem três catálogos
   por tipo de conta, um agregador multi-fonte com contrato de "fonte ausente",
   e um backend de GA4 inteiro que nunca foi ligado.
2. A aba Site tem **8 abas** hoje; cinco são dados e cabem nos seus dois blocos.
3. O que falta de verdade é pequeno e específico: alertas por tipo, UI de GA4,
   receita no GA4, e um resolvedor de fontes que leia do banco.

---

## 1. Como o dashboard está organizado hoje

`client/src/pages/Dashboard.tsx` (939 linhas), na ordem em que renderiza:

| # | Bloco | Origem |
|---|---|---|
| 1 | Header + período (presets e datas customizadas) | local |
| 2 | `AccountHeader` — identidade, integrações, snapshot do dia, status da IA | `clientConfig` (hardcoded) |
| 3 | Faixa de alertas críticos da conta | `trpc.alerts.list` |
| 4 | Em andamento — sugestões aplicadas | `trpc.suggestions` |
| 5 | Campanhas + Destaques do período | `trpc.dashboard.overview` |
| 6 | **KPIs adaptativos, 4 por linha** | `KPI_CONFIGS[goalType]` |
| 7 | Gráficos — Investimento diário e ROAS/resultado por dia | `overview` |
| 8 | Ver sugestões da IA | link |

`dashboard.overview` ([routers.ts:2195](server/routers.ts#L2195)) monta
`metrics + campaigns + alerts + anomalies + prevMetrics` — **tudo Meta Ads**.
É o ponto natural de entrada para outras fontes.

## 2. O que deve ser reaproveitado

| Ativo | Onde | Por que importa |
|---|---|---|
| `KPI_CONFIGS` | [kpiConfig.ts:76](client/src/lib/kpiConfig.ts#L76) | KPIs por tipo, **já em ordem de prioridade**, com formatador e tendência |
| `getDayStatus` | [kpiConfig.ts:214](client/src/lib/kpiConfig.ts#L214) | semáforo bom/regular/ruim **por tipo** |
| `PERFORMANCE_GOAL_PROFILES` | [campaignObjectives.ts:251](server/campaignObjectives.ts#L251) | `primaryMetrics`, `tableColumns`, `insightMetrics`, `actionTypes` por objetivo |
| `THRESHOLD_FIELDS` | [Settings.tsx:30](client/src/pages/Settings.tsx#L30) | quais limiares importam por tipo |
| `Bloco<T>` com `presente`/`porque` | [clientIntelligence.ts:55](server/services/clientIntelligence.ts#L55) | **o contrato de fonte ausente que você pediu, já escrito** |
| `WIDGETS` + `resolverWidgets` | [shared/widgets.ts](shared/widgets.ts) | blocos com visibilidade e ordem por papel, preferência salva por usuário |
| Formatadores seguros | [Site.tsx:31-77](client/src/pages/Site.tsx#L31-L77) | `ehNum`/`fmtDec` — dado ausente vira "—", nunca quebra |
| `client_site_snapshots` | [schema.ts:280](drizzle/schema.ts#L280) | **tabela genérica `(accountId, provider, dia, metricsJson)`** |
| `urlGuard` | [services/urlGuard.ts](server/services/urlGuard.ts) | anti-SSRF, obrigatório para qualquer URL de cliente |

O item mais subestimado é `client_site_snapshots`: ela já guarda **quatro**
provedores diferentes (`pagespeed`, `security_check`, `uptime_check`, e os
declarados `gtmetrix`/`manual`) no mesmo formato. GA4 e e-commerce entram como
mais provedores, sem tabela nova.

## 3. Onde está a lógica de tipo de conta

Um ponto de resolução só:

```ts
// analysisService.ts:370
const dominantGoal = goalTypeOverride ?? detectedGoal;
```

- **Override manual:** `metaAdAccounts.goalTypeOverride` ([schema.ts:501](drizzle/schema.ts#L501)), editado em [Settings.tsx:268](client/src/pages/Settings.tsx#L268), gravado por `updateAccountGoalType` ([db.ts:545](server/db.ts#L545)).
- **Detecção automática:** `detectDominantGoal` / `detectDominantObjective` ([campaignObjectives.ts:462](server/campaignObjectives.ts#L462), [:527](server/campaignObjectives.ts#L527)) — moda dos `optimization_goal` das campanhas com gasto.
- **Tradução para a UI:** `mapGoalToType` ([kpiConfig.ts:37](client/src/lib/kpiConfig.ts#L37)) converte o goal da Meta nos seus 11 tipos.

## 4. Como os alertas usam o tipo hoje

**Não usam.** É a lacuna principal.

Os limiares de anomalia são **constantes globais** ([analysisService.ts:36-41](server/analysisService.ts#L36-L41)):

```ts
const MULTI_PERIOD_THRESHOLDS = {
  cost:        { d7: 200, d14: 160, d30: 130 },
  performance: { d7: -60, d14: -50, d30: -40 },
  delivery:    { d7: -75, d14: -65, d30: -55 },
  results:     { d7: -30, d14: -30, d30: -30 },
};
```

Os mesmos números para SALES, MESSAGES e AWARENESS. Uma queda de ROAS é medida
em conta de mensagens, onde ROAS não significa nada; uma queda de alcance pesa
igual em AWARENESS (onde é o produto) e em SALES (onde é ruído).

O único lugar onde o tipo influencia limiar é `accountThresholds` — configuração
**manual por conta**, cujos campos variam por tipo na tela, mas cujo padrão não
vem do tipo.

Alertas de site (`siteHealthAlerts.ts`, `clarityAlertService.ts`) também são
100% independentes do tipo — o que é correto para SSL, e discutível para
"scroll baixo" (crítico em TRAFFIC, irrelevante em MESSAGES).

## 5. Como a IA usa o tipo hoje

Bem, e é o melhor exemplo a seguir. Em `generateAiSuggestions`
([analysisService.ts:287](server/analysisService.ts#L287)) o `dominantGoal` entra
no prompt e **desliga métricas irrelevantes**:

> *"Se o objetivo for MESSAGES, CONVERSATIONS, REPLIES ou TRAFFIC, IGNORE
> completamente métricas de ROAS e valor de conversão."*
> — [analysisService.ts:531](server/analysisService.ts#L531)

O `resultLabel` por objetivo também troca o vocabulário ("Compras no site" vs
"Mensagens iniciadas"). O briefing diário e o `siteReportService` seguem a mesma
linha.

## 6 e 7. GA4 hoje — existe quase tudo, e nada está ligado

**Existe:**

| Peça | Onde | Estado |
|---|---|---|
| Serviço | [ga4Service.ts](server/ga4Service.ts) (530 linhas) | chamadas reais à Data API v1beta e Admin API |
| 9 coletores | `getGA4Overview`, `DailyMetrics`, `TrafficSources`, `TopPages`, `DeviceBreakdown`, `GeoBreakdown`, `Conversions`, `listGA4Properties` | prontos |
| OAuth | [googleOAuthCallback.ts:47](server/googleOAuthCallback.ts#L47) | escopo `analytics.readonly` **já concedido** |
| Tabela | `ga4_accounts` | **existe em produção, 0 linhas** (conferido) |
| CRUD | [db.ts:1663-1719](server/db.ts#L1663-L1719) | pronto |
| tRPC | [routers.ts:5060-5250](server/routers.ts#L5060-L5250) | **13 procedures** |

**Não existe:**

- **UI nenhuma.** `trpc.ga4` não é chamado em lugar algum do cliente.
- **Cron nenhum.** `getAllActiveGA4Accounts()` não tem chamador.
- **Nenhuma tabela de snapshot** — os dados seriam buscados ao vivo a cada request.
- **Nenhuma métrica de receita.** Sem `purchaseRevenue`, `transactions`,
  `itemRevenue`, `ecommercePurchases`. Para a Parte 2 isso é código novo.

**Três problemas que precisam de decisão antes de ligar:**

1. `ga4_accounts.refreshToken` é **texto puro**. O padrão certo já existe no
   projeto: `user_integrations.refreshTokenEncrypted` com AES-256-GCM.
2. As procedures de leitura buscam por id e **não conferem o dono**, embora
   `accounts` liste por usuário — inconsistência que vira vazamento no dia em
   que a tabela tiver linhas.
3. `ga4.isConfigured` é `publicProcedure`.
4. O OAuth com `state=ga4` é **beco sem saída**: mostra o refresh token num
   `<textarea>` para copiar à mão. O caminho bom já existe no `state=googleads`
   (criptografa e grava em `user_integrations`).

## 8. Proposta de arquitetura — o que muda de verdade

Quatro peças, todas aditivas.

### 8.1 `fontesDoCliente(accountId)` — um resolvedor, servidor, lendo o banco

Hoje o cabeçalho lê [clientConfig.ts](client/src/config/clientConfig.ts), um
arquivo **hardcoded no frontend** onde **nenhum dos 11 clientes** preenche
`ga4PropertyId` ou `googleAdsCustomerId`. O chip "GA4" está apagado para todo
mundo, sempre — e continuaria apagado mesmo com GA4 conectado.

Enquanto isso o banco já sabe a verdade: `google_ad_accounts.linkedAccountId`
(4 contas vinculadas), `client_clarity_settings`, `client_site_snapshots`.

O resolvedor devolve, por fonte, o mesmo contrato que `clientIntelligence` já
usa:

```ts
type Fonte = { chave: string; rotulo: string; presente: boolean; porque?: string };
```

`clientConfig.ts` fica só com identidade visual (nome, cor, avatar).

### 8.2 Catálogo por tipo, estendido — não substituído

`PERFORMANCE_GOAL_PROFILES` ganha dois campos:

```ts
interface PerformanceGoalProfile {
  // … campos atuais, intactos
  fontesRelevantes: FonteChave[];   // ordem de importância das fontes externas
  alertasCriticos: RegraAlerta[];   // o que é grave PARA ESTE TIPO
}
```

Isso resolve as Partes 3 e 6 sem tocar em nada existente: quem lê
`primaryMetrics` hoje continua lendo.

### 8.3 Limiares de anomalia por tipo

`MULTI_PERIOD_THRESHOLDS` vira `THRESHOLDS_POR_TIPO`, com o conjunto atual como
`DEFAULT`. Nenhuma conta muda de comportamento até que seu tipo ganhe entrada
própria — a migração é gradual e reversível.

### 8.4 Snapshots de GA4 e e-commerce na tabela que já existe

`client_site_snapshots` já é `(accountId, provider, url, estrategia, dia,
metricsJson, …)`. Novos provedores:

- `ga4_traffic` — sessões, usuários, canais, landing pages
- `ga4_ecommerce` — receita, compras, ticket, checkout
- `shopify` / `woocommerce` / `wix` — pedidos, receita, carrinho

Ganha-se de graça: histórico, comparação com período anterior, dedup por dia, e
os leitores `ultimoSnapshotPorProvider` / `serieSnapshotsPorProvider`.

> Atenção: `PERF_PROVIDERS` ([db.ts:4133](server/db.ts#L4133)) filtra a aba de
> performance técnica. Foi criado depois de um bug em que um snapshot de
> segurança apareceu na aba de performance e quebrou a tela. Provedor novo
> **precisa** entrar na lista certa.

## 9. Reorganização da aba Site — 8 abas viram 2 blocos + 3 ferramentas

Hoje: `Visão geral · Clarity · Performance técnica · Segurança · Uptime ·
Relatórios · Contexto · Perguntar`.

Proposta:

| Bloco | Absorve | Conteúdo |
|---|---|---|
| **Performance** | Clarity + GA4 (novo) | sessões, usuários, novos usuários, canais, origem/mídia, landing pages, páginas mais vistas, eventos, conversões, tempo médio, páginas/sessão, scroll, cliques mortos, rage clicks + **vendas quando houver fonte** |
| **Técnico** | Performance técnica + Segurança + Uptime | score, LCP, CLS, TBT, peso, requisições, SSL, headers, uptime, redirects |

`Relatórios`, `Contexto` e `Perguntar` **continuam abas próprias** — são
ferramentas, não painéis de dado. Mexer nelas seria retrabalho sem ganho.

Cada bloco é uma seção expansível com um cabeçalho que responde as quatro
perguntas da Parte 5 (o que houve, por que importa, precisa de ação, próximo
passo). Fonte ausente **não gera card**: vira uma linha na área "Fontes deste
diagnóstico", que já existe em [Site.tsx:938](client/src/pages/Site.tsx#L938)
com as pastilhas de presença.

**INP não é coletado hoje** — nem CrUX, nem field data. Os Core Web Vitals
disponíveis são LCP e CLS (mais TBT como proxy de laboratório). Incluir INP de
verdade exige a API CrUX: é trabalho novo, não reorganização.

## 10. Evolução do dashboard do cliente

Sem tela nova. Três mudanças sobre o que existe:

1. **Ordem dos blocos vem do tipo.** `fontesRelevantes` decide a sequência.
   Em SALES, vendas/GA4 e-commerce sobem; em AWARENESS, alcance e frequência.
2. **Uma faixa de fontes** logo abaixo do `AccountHeader`, alimentada por
   `fontesDoCliente` — é onde as ausências aparecem, discretamente, em um lugar
   só, em vez de espalhadas em cards vazios.
3. **KPIs continuam vindo de `KPI_CONFIGS`.** Só ganham fallback: quando o tipo
   pede uma métrica que só o GA4 tem e o GA4 não está conectado, o KPI cede o
   lugar em vez de mostrar zero.

## 11 e 12. E-commerce plugável

Nada existe hoje: sem Shopify, WooCommerce ou Wix; `begin_checkout` tem **zero
ocorrências** no repositório. Os únicos sinais de carrinho vêm do Meta
(`campaign_metrics.add_to_cart`, `purchase_roas`).

Interface única, um adaptador por plataforma:

```ts
interface ProvedorVendas {
  chave: "shopify" | "woocommerce" | "wix" | "ga4" | "none";
  conectado(): Promise<boolean>;
  pedidos(periodo): Promise<Pedidos | null>;
  receita(periodo): Promise<Receita | null>;
  carrinhoAbandonado(periodo): Promise<Carrinho | null>;
}
```

**Regra de precedência, para não somar a mesma venda duas vezes:**

```
fonte primária de receita   = plataforma (Shopify/Woo/Wix) > GA4 e-commerce > nenhuma
fonte de comportamento      = GA4 + Clarity   (sempre complementares)
fonte de campanha           = Meta Ads + Google Ads
```

A receita **nunca** soma fontes. A tela mostra a primária e, havendo divergência
com a secundária, **declara a divergência** em vez de escolher em silêncio —
divergência entre Shopify e GA4 é informação, não erro a esconder.

## 13. Arquivos que seriam alterados

**Novos**
```
server/services/fontesDoCliente.ts        resolvedor de fontes (lê do banco)
server/services/ga4Sync.ts                cron + snapshot de GA4
server/services/vendas/index.ts           interface ProvedorVendas + precedência
server/services/vendas/ga4.ts             adaptador GA4 e-commerce
client/src/pages/site/BlocoPerformance.tsx
client/src/pages/site/BlocoTecnico.tsx
client/src/components/FaixaDeFontes.tsx
```

**Alterados (aditivo)**
```
server/campaignObjectives.ts     + fontesRelevantes, alertasCriticos
server/analysisService.ts        limiares por tipo (atual vira DEFAULT)
server/ga4Service.ts             + métricas de receita
server/routers.ts                + ga4 na overview; corrigir dono e isConfigured
server/googleOAuthCallback.ts    state=ga4 grava criptografado (igual googleads)
server/autoSync.ts               + cron de GA4
drizzle/schema.ts                ga4_accounts.refreshTokenEncrypted
scripts/ensure-schema.mjs        migração aditiva
client/src/pages/Site.tsx        8 abas → 2 blocos + 3 ferramentas
client/src/pages/Dashboard.tsx   ordem por tipo + faixa de fontes
client/src/config/clientConfig.ts  reduzir a identidade visual
```

## 14, 15, 16 — o que se reaproveita, o que é novo, o que não se toca

**Reaproveitado:** `KPI_CONFIGS`, `getDayStatus`, `PERFORMANCE_GOAL_PROFILES`,
`THRESHOLD_FIELDS`, `Bloco<presente/porque>`, `client_site_snapshots` e seus
leitores, formatadores seguros do Site, `urlGuard`, todo o `ga4Service`, o CRUD
e as procedures de GA4, o mecanismo de widgets, `AccountHeader`,
`clientIntelligence`, `siteReportService`.

**Novo:** resolvedor de fontes, cron e snapshot de GA4, receita no GA4,
adaptadores de e-commerce, precedência de receita, limiares por tipo, os dois
blocos da aba Site, faixa de fontes.

**Não mexer:** Meta Ads (`metaAdsService`, sync, `campaign_metrics`), Google Ads
(travado em aprovação do token), Instagram, SELVA TV, Você Prefere, Acessos,
Contracts, Financeiro, Calendar OAuth, Trello OAuth, usuários/exclusão anônima,
digest/e-mail (pausado), abas Relatórios/Contexto/Perguntar, `urlGuard`.

## 17. Plano em fases

**F1 — Fundação invisível.** `fontesDoCliente` + faixa de fontes no dashboard.
Nada muda de layout; passa a existir um lugar único e verdadeiro para
"o que está conectado". Base de todo o resto.

**F2 — Aba Site reorganizada.** 8 abas → Performance + Técnico + as 3
ferramentas. Só reorganização: sem fonte nova, risco baixo, ganho imediato.

**F3 — Tipo de conta manda no dashboard.** `fontesRelevantes` ordena os blocos;
`alertasCriticos` e os limiares por tipo entram no motor de anomalias. É a fase
de maior ganho por linha de código.

**F4 — GA4 ligado.** Corrigir criptografia, dono e `isConfigured`; fechar o
OAuth `state=ga4`; cron + snapshots; bloco de tráfego/comportamento na aba Site.
**Sem e-commerce ainda.**

**F5 — GA4 e-commerce.** Métricas de receita no serviço; bloco de vendas quando
houver evento de compra.

**F6 — Plataformas de e-commerce.** `ProvedorVendas` + Shopify primeiro
(melhor API das três), depois WooCommerce e Wix. Precedência de receita ativa.

F1–F3 não dependem de integração nenhuma e podem ir inteiras. F4 depende de
conectar uma propriedade GA4. F5 depende de F4. F6 depende de credencial do
cliente.
