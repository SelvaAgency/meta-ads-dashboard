# Meta Ads Analytics Dashboard - TODO

## Banco de Dados & Schema
- [x] Tabela meta_ad_accounts (contas de anúncio vinculadas por usuário)
- [x] Tabela campaigns (campanhas coletadas da API)
- [x] Tabela campaign_metrics (métricas diárias históricas)
- [x] Tabela anomalies (anomalias detectadas)
- [x] Tabela ai_suggestions (sugestões de melhoria geradas por IA)
- [x] Tabela scheduled_reports (configurações de relatórios recorrentes)
- [x] Tabela alerts (alertas disparados)

## Backend - Integração Meta Ads API
- [x] Rota para conectar conta Meta Ads (token manual com validação)
- [x] Rota para listar contas de anúncio disponíveis
- [x] Rota para coletar campanhas da API do Meta Ads
- [x] Rota para coletar métricas de campanhas (ROAS, CPA, conversões, impressões, cliques)
- [x] Sincronização manual de dados via botão no dashboard
- [x] Armazenamento seguro de tokens Meta Ads por usuário no banco de dados

## Backend - Engine de Análise com IA
- [x] Detecção de anomalias (queda de ROAS, pico de CPA, mudanças de entrega)
- [x] Diagnóstico de erros de campanha (segmentação, criativos, fadiga)
- [x] Gerador de sugestões de melhoria via LLM (invokeLLM)
- [x] Sistema de pontuação de saúde de campanha

## Backend - Alertas e Relatórios
- [x] Sistema de alertas para anomalias críticas
- [x] Gerador de relatórios diários/semanais via LLM
- [x] Notificação ao owner via sistema de notificações (notifyOwner)

## Frontend - Design e Layout
- [x] Tema dark elegante com paleta azul/roxo profissional (oklch)
- [x] DashboardLayout com sidebar navegação (MetaDashboardLayout)
- [x] Tipografia e tokens de design

## Frontend - Páginas
- [x] Página de conexão de conta Meta Ads (onboarding + validação de token)
- [x] Dashboard principal com KPIs e gráficos de tendências (ROAS, gasto, conversões)
- [x] Página de campanhas com tabela comparativa (top/under performers)
- [x] Página de anomalias com detecção e resolução
- [x] Página de sugestões de IA com ações recomendadas
- [x] Página de relatórios recorrentes (diário/semanal + geração manual)
- [x] Página de alertas (central de notificações)
- [x] Landing page de onboarding

## Testes
- [x] Testes de cálculos Meta Ads (ROAS, CPA, conversões)
- [x] Testes de detecção de anomalias
- [x] Testes de autenticação (logout)

## Melhorias de Multi-Conta (Agência)
- [x] Importar todas as contas do portfólio de uma vez ao validar token
- [x] Seletor de conta fixo na sidebar com nome e avatar da conta ativa
- [x] Contexto global de conta ativa (ActiveAccountContext) compartilhado entre todas as páginas
- [x] Dashboard, Campanhas, Anomalias, Sugestões e Relatórios filtram dados pela conta ativa
- [x] Alternância instantânea de conta sem precisar inserir token novamente

## Monitoramento de Saldo e Forma de Pagamento
- [x] Buscar campos balance, funding_source_details, spend_cap, amount_spent da API do Meta por conta
- [x] Exibir forma de pagamento (cartão, PIX/boleto, saldo pré-pago) no dashboard e na tela de contas
- [x] Calcular saldo remanescente para contas pré-pagas (spend_cap - amount_spent ou balance)
- [x] Card de saldo no dashboard com indicador visual (verde/amarelo/vermelho)
- [x] Alerta automático quando saldo remanescente < R$200
- [x] Notificação push ao owner quando saldo crítico detectado

## Correção de Cálculos de Métricas
- [x] Investigar discrepância: dashboard mostra ROAS 26.97x mas Meta Ads Manager mostra 5.92 e 3.26
- [x] Corrigir cálculo de ROAS (purchase_roas da API, não calcular manualmente)
- [x] Corrigir cálculo de CPA (spend / conversions, usando resultado correto por meta de desempenho)
- [x] Corrigir Valor de Conversão (filtrar apenas action_values de compra, não somar funil todo)
- [x] Corrigir Conversões (usar optimization_goal do adset para extrair o tipo correto de resultado)

## Dashboard Adaptativo por Objetivo de Campanha
- [x] Backend: detectar objetivo dominante da conta (OUTCOME_SALES, OUTCOME_LEADS, MESSAGES, REACH, ENGAGEMENT, etc.)
- [x] Backend: mapear quais métricas exibir por objetivo (ex: vendas → ROAS, CPA, valor de conversão; mensagens → custo por mensagem, nº mensagens; alcance → CPM, frequência)
- [x] Backend: buscar métricas específicas por objetivo na API do Meta (purchase, lead, onsite_conversion.messaging_conversation_started_7d, etc.)
- [x] Frontend: Dashboard exibe KPI cards dinâmicos de acordo com o objetivo detectado da conta (8 cards em 2 linhas de 4)
- [x] Frontend: Badge de objetivo visível no header do dashboard por conta
- [x] Frontend: Top Performers e Underperformers ordenados pelo KPI primário do objetivo

## Relatórios no Formato Padrão de Agência
- [x] Backend: gerador de relatório diário (dados de ontem) no formato padrão com emojis e seções
- [x] Backend: gerador de relatório semanal (últimos 7 dias) no formato padrão
- [x] Backend: relatório inclui análise por campanha, resumo estratégico e recomendações de conjuntos e criativos via IA
- [x] Backend: endpoint de geração sob demanda (diário e semanal) com dados reais da API
- [x] Frontend: botão "Gerar Relatório Diário" e "Gerar Relatório Semanal" na página de Relatórios
- [x] Frontend: exibição do relatório gerado em texto puro com botão "Copiar" para área de transferência
- [x] Frontend: agendamento de relatórios (diário às 08h / semanal toda segunda às 08h) com notificação
- [x] Frontend: seção de agendamentos com toggle ativo/pausado e exclusão

## Correção de Cálculos de Métricas (Discrepância com Meta Ads Manager)
- [x] Corrigir ROAS: usar cálculo ponderado (total_conversion_value / total_spend) em vez de AVG simples
- [x] Corrigir CPA: usar cálculo ponderado (total_spend / total_conversions) em vez de AVG simples
- [x] Corrigir CTR: usar cálculo ponderado (total_clicks / total_impressions * 100) em vez de AVG simples
- [x] Corrigir CPC: usar cálculo ponderado (total_spend / total_clicks) em vez de AVG simples
- [x] Corrigir CPM: usar cálculo ponderado (total_spend / total_impressions * 1000) em vez de AVG simples
- [x] Corrigir Frequência: usar cálculo ponderado (total_impressions / total_reach) em vez de AVG simples

## Diagnóstico e Correção de Discrepâncias (Meta Ads Manager vs Dashboard)
- [x] Diagnóstico: identificar 3 bugs de integração com Meta API
- [x] Corrigir: buscar purchase_roas da API diretamente (não calcular manualmente)
- [x] Corrigir: buscar resultados usando optimization_goal do adset (não só purchase)
- [x] Corrigir: custo_por_resultado = spend / results (usando resultado correto por meta de desempenho)
- [x] Corrigir: valor de conversão filtrado apenas para action_values de compra
- [x] Refatorar: usar optimization_goal do adset (não objective da campanha) para determinar métricas
- [x] Refatorar: buscar adsets com optimization_goal via API do Meta
- [x] Salvar optimizationGoal e resultLabel na tabela campaigns (migration aplicada)
- [x] Frontend: coluna Resultados mostra o tipo correto (Compras, Mensagens, Leads etc.)
- [x] Frontend: subtítulo abaixo do nome da campanha mostra o tipo de resultado

## Refatoração: Dashboard por Meta de Desempenho (optimization_goal)
- [x] Backend: retornar optimization_goal dominante da conta no endpoint dashboard.overview
- [x] Backend: mapear optimization_goal → KPI cards (não objective da campanha)
- [x] Frontend: Dashboard usa optimization_goal (não objective) para escolher KPI cards
- [x] Frontend: badge no header mostra a meta de desempenho real (ex: "Compras no site", "Mensagens")
- [x] Frontend: KPI cards mostram métricas relevantes para a meta de desempenho configurada

## Correção de Discrepâncias - Conta C1 ELWING (Mar/26)
- [x] Diagnosticar: badge mostrava "Engajamento" porque campanhas inativas com objective=OUTCOME_ENGAGEMENT tinham optimization_goal=POST_ENGAGEMENT no banco e influenciavam o detectDominantGoal
- [x] Corrigir: Alcance mostrava 0 porque totals no backend não somava reach (só somava spend/impressions/clicks/conversions)
- [x] Corrigir: optimization_goal agora usa fallback pelo objective quando adsets não retornam o campo
- [x] Corrigir: detectDominantGoal agora filtra apenas campanhas com spend > 0 no período selecionado
- [x] Corrigir: reach é agora somado no totals do backend e passado ao frontend

## Top/Underperformers e Gráficos por Meta de Desempenho
- [x] Top Performers: filtrar apenas campanhas com status ACTIVE
- [x] Top Performers: ordenar por totalConversions (resultados) não por ROAS
- [x] Top Performers: se 2 campanhas ativas, ambas aparecem em Top; se >2, as melhores em Top e a pior em Under
- [x] Underperformers: filtrar apenas campanhas ATIVAS com pior resultado; mensagem explicativa quando ≤2 ativas
- [x] Gráfico direito: mostrar métrica principal da conta (Resultados para mensagens/leads, ROAS só para vendas)
- [x] Gráfico direito: título e dataKey dinâmicos baseados no goalType (chartMetricKey/chartMetricLabel)

## Refatoração Módulo Sugestões IA
- [x] Schema: adicionar campos status (pending/applied/rejected), justificativa, appliedAt, monitoredUntil, monitorResult
- [x] Migration SQL aplicada via webdev_execute_sql
- [x] Backend: análise real da conta antes de gerar sugestões (não gerar se não houver dados suficientes)
- [x] Backend: endpoint para atualizar status (aplicado/não aplicado) com justificativa opcional
- [x] Backend: monitoramento pós-aplicação (7 dias) com monitorUntil no banco
- [x] Backend: retroalimentação — salvar justificativas de recusa para melhorar futuras sugestões
- [x] Frontend: botão "Analisar Conta" com feedback condicional (avisa quando não há dados)
- [x] Frontend: mensagem clara quando não há sugestões plausíveis
- [x] Frontend: botões "Aplicado" e "Não Aplicado" em vez de "Aplicar Sugestão"
- [x] Frontend: campo opcional de justificativa ao marcar "Não Aplicado"
- [x] Frontend: possibilidade de trocar entre Aplicado/Não Aplicado em qualquer momento nos 30 dias
- [x] Frontend: aba "Histórico 30 dias" com sugestões aplicadas e recusadas
- [x] Frontend: badge de monitoramento ativo nas sugestões aplicadas (7 dias)
- [x] Frontend: resultado do monitoramento exibido após 7 dias

## Correção Definitiva do Sync de Dados
- [x] Limpar duplicatas no banco (DELETE com JOIN por campaignId + date)
- [x] Adicionar índice único (campaignId, date) na tabela campaign_metrics
- [x] Corrigir schema Drizzle para registrar o índice único
- [x] Adicionar sync automático diário às 06h (cron job node-cron, 09:00 UTC)
- [x] Salvar checkpoint e avisar usuário para ressincronizar

## Anomalias e Alertas
- [x] Backend: detecção automática de anomalias a cada hora via cron job
- [x] Backend: campo emailSentAt na tabela de anomalias/alertas para controlar envio único
- [x] Backend: notificação por email apenas uma vez por anomalia/alerta (não repetir)
- [x] Frontend: anomalias carregam automaticamente a cada 5 min (sem botão "Executar Detecção")
- [x] Frontend: alertas somem da lista ao marcar como lido (optimistic update)
- [x] Frontend: "Marcar todos como lidos" remove todos os alertas de uma vez

## Regras de Anomalias e Alertas em Tempo Real
- [ ] Anomalia: queda de performance geral (CTR, impressões, entrega)
- [ ] Anomalia: queda de ROAS ≥ 10% em relação à média dos 7 dias anteriores
- [ ] Anomalia: queda de resultados ≥ 20% após análise de 7 dias
- [ ] Anomalia: alteração abrupta de métricas que prejudique a campanha (pico de CPA, queda de CTR > 30%)
- [ ] Alerta em tempo real: campanha pausada por erro (effective_status = WITH_ISSUES ou CAMPAIGN_PAUSED)
- [ ] Alerta em tempo real: saldo abaixo de R$200 na conta
- [ ] Alerta em tempo real: falha no pagamento (funding_source_details com status de erro)
- [ ] Alerta em tempo real: criativo rejeitado (ad com review_feedback ou status DISAPPROVED)
- [ ] Alerta em tempo real: erros no conjunto ou nos criativos (adset/ad com effective_status problemático)
- [ ] Backend: buscar effective_status de campanhas, adsets e ads na API do Meta para detectar problemas
- [ ] Backend: buscar review_feedback dos ads para detectar criativos rejeitados
- [ ] Backend: verificar funding_source_details para detectar falha de pagamento

## Agendamento Personalizável e Filtro de Campanhas
- [ ] Frontend: horário de agendamento de relatório personalizável (input de hora/minuto)
- [ ] Backend: salvar horário personalizado no scheduled_reports e usar no cron
- [ ] Frontend: página de Campanhas mostra apenas ATIVAS + PAUSADAS nos últimos 7 dias
- [ ] Backend: filtrar campanhas por status ACTIVE ou (PAUSED com updatedAt nos últimos 7 dias)

## Separação Anomalias vs Alertas Técnicos
- [x] Anomalias: restringir a desvios estatísticos de métricas com base em janela de 7 dias
- [x] Alertas técnicos: página desvinculada da BM
- [x] Alertas técnicos: Instagram desvinculado da página
- [x] Alertas técnicos: pixel com erro ou inativo
- [x] Alertas técnicos: adset sem entrega por >24h
- [x] Alertas técnicos: campanha parada por erro (WITH_ISSUES)
- [x] Alertas técnicos: saldo insuficiente (<R$200)
- [x] Alertas técnicos: falha de pagamento
- [x] Alertas técnicos: anúncio rejeitado
- [x] Schema: novos tipos de alerta (PAGE_UNLINKED, INSTAGRAM_UNLINKED, PIXEL_ERROR, ADSET_NO_DELIVERY)
- [x] Frontend: ícones e labels específicos para cada tipo de alerta técnico

## Revisão Alertas vs Anomalias (v2)
- [x] Alertas: manter apenas erros técnicos (CAMPAIGN_PAUSED, BUDGET_WARNING, PAYMENT_FAILED, AD_REJECTED, AD_ERROR, PAGE_UNLINKED, INSTAGRAM_UNLINKED)
- [x] Alertas: remover ADSET_NO_DELIVERY e PIXEL_ERROR da aba Alertas (mover para Anomalias ou suprimir)
- [x] Anomalias: threshold ROAS queda ≥10%
- [x] Anomalias: threshold resultados queda ≥20%
- [x] Anomalias: detectar por campanha individual (não só conta agregada)
- [x] Anomalias: remover tipos não-métricos (ANOMALY genérico de alertas)
- [x] AlertsPage: labels e ícones corretos para PAGE_UNLINKED e INSTAGRAM_UNLINKED
- [x] AnomaliesPage: exibir campanha afetada em cada anomalia

## UX Anomalias
- [x] Remover botão "Resolver" das anomalias — manter apenas botão "Visto"

## Histórico de Anomalias
- [x] Anomalias marcadas como "Visto" vão para seção colapsável "Histórico (30 dias)"
- [x] Limpeza automática de anomalias lidas com mais de 30 dias no autoSync
- [x] Seção histórico recolhida por padrão, expansível com clique

## Dashboard Builder de Tráfego Pago (módulo independente)
- [x] Schema: tabela dashboard_reports (id, userId, clientName, context, mode, platform, reportJson, pdfUrl, createdAt)
- [x] tRPC procedure: dashboardBuilder.generate (recebe imagens S3 + dados, chama LLM, salva relatório)
- [x] tRPC procedure: dashboardBuilder.list e dashboardBuilder.getById
- [x] tRPC procedure: dashboardBuilder.exportPdf (gera HTML e salva no S3 para impressão)
- [x] Página DashboardBuilder.tsx: formulário com upload de 1 ou 2 prints, nome do cliente, contexto semanal, toggle modo
- [x] Página DashboardBuilderResult.tsx: exibe relatório gerado com botão de exportar PDF
- [x] Lógica LLM: prompt especializado seguindo todas as regras do escopo (polaridade, análise por campanha, resumo estratégico)
- [x] Geração de PDF profissional: sem gráficos, cores apenas nos indicadores de variação, design limpo
- [x] Rota /dashboard-builder e /dashboard-builder/:id no App.tsx
- [x] Item "Dashboard Builder" no menu lateral

## Aprimoramento Sugestões IA (v2 — 3 níveis)
- [x] Backend: buscar adsets com métricas (segmentação, orçamento, CTR, CPA, frequência, conversões) por conta
- [x] Backend: buscar ads/criativos com métricas (formato, CTR, CPC, frequência, conversões) por adset
- [x] Backend: cruzar dados campanha + adset + criativo antes de gerar sugestões
- [x] Backend: prompt LLM reescrito com 6 tipos de sugestão (pausar criativo, pausar conjunto, novos públicos, realocação, novos criativos, novos conjuntos)
- [x] Backend: sugestões com nomenclatura exata (nome da campanha, conjunto e criativo)
- [x] Backend: sugestões com comparação de métricas (individual vs média do nível acima)
- [x] Backend: priorização P1/P2/P3 por urgência e impacto
- [x] Backend: regra de nunca sugerir aumento de orçamento total
- [x] Backend: regra de não dar briefing criativo (apenas formato)
- [x] Frontend: exibir badge de prioridade (P1 urgente, P2 alto impacto, P3 oportunidade)
- [x] Frontend: exibir tipo de sugestão (Pausar Criativo, Pausar Conjunto, Novo Público, etc.)
- [x] Frontend: exibir métricas de justificativa em cada sugestão

## Dashboard Builder — Correções e Melhorias
- [x] Campo de data digitada (dd/mm/aaaa) no formulário — modo único e comparativo
- [x] Corrigir erro ao clicar em Gerar relatório
- [x] Prompt LLM: extrair TODAS as métricas visíveis nos prints (não apenas as fixas)
- [x] Análise por campanha com status de veiculação (ativa/inativa no período analisado)
- [x] Página de resultado: exibir todas as métricas extraídas e status por campanha

## Dashboard Builder — Período e Métricas por Objetivo
- [x] Seletor de período: Hoje / Ontem / Hoje e Ontem / Personalizado (dd/mm/aaaa)
- [x] Período selecionado aparece no cabeçalho do relatório gerado
- [x] Prompt LLM: métrica principal obrigatória por objetivo de campanha
- [x] Prompt LLM: 4 métricas fixas em TODA campanha (Seguidores, Cliques, Alcance, CTR)
- [x] Prompt LLM: demais métricas disponíveis exibidas após as fixas
- [x] Resultado: destacar visualmente a métrica principal de cada campanha
- [x] Resultado: seção de métricas fixas separada das demais

## Agendamento Individual por Conta
- [x] Schema: adicionar accountId, scheduleDay (0-6), scheduleMinute (0-59) ao scheduled_reports
- [x] Schema: migration aplicada via webdev_execute_sql
- [x] Backend: cron dinâmico por conta (não global) — cada conta tem seu próprio job
- [x] Backend: ao salvar/atualizar agendamento, recriar o cron job da conta
- [x] Backend: geração automática do relatório no horário configurado por conta
- [x] Backend: relatório gerado mesmo sem atividade (indica período sem gasto)
- [x] Frontend: Reports.tsx lista TODAS as contas com configuração individual
- [x] Frontend: toggle ativo/desativado por conta (independente)
- [x] Frontend: seletor de frequência (diário/semanal) por conta
- [x] Frontend: seletor de dia da semana (apenas no modo semanal) por conta
- [x] Frontend: seletor de hora (00-23) por conta
- [x] Frontend: seletor de minuto (00-59) por conta
- [x] Frontend: indicador do próximo disparo agendado por conta

## Alertas com Prioridade Crítica/Alta/Média
- [x] Schema: adicionar campo priority (CRITICAL/HIGH/MEDIUM) e suggestedAction na tabela alerts
- [x] Schema: migration aplicada
- [ ] Backend: alertas CRÍTICOS — conta bloqueada, erro de pagamento, campanha parou, anúncio reprovado, gasto 2x orçamento, pixel zerou, queda 80% alcance
- [ ] Backend: alertas ALTOS — CPC 3x, custo/resultado 2.5x, CTR -60%, frequência >4, aprendizado limitado, ROAS <1
- [ ] Backend: alertas MÉDIOS — frequência >2.5, criativo sem resultado, orçamento consumido antes 18h, CTR caindo 3 dias
- [ ] Backend: frequências diferenciadas — críticos imediatos, altos a cada 30min, médios consolidados a cada 2h
- [ ] Backend: não repetir alerta da mesma anomalia se já foi alertado e não houve mudança
- [ ] Backend: alerta de resolução quando anomalia for corrigida
- [x] Frontend: badges de prioridade Crítica (vermelho), Alta (laranja), Média (amarelo)
- [x] Frontend: estrutura completa do alerta (prioridade, conta, o que aconteceu, dados, ação sugerida, timestamp)

## Aba Campanhas — 12 Métricas Fixas
- [x] Backend: buscar profile_visits, follower_count, frequency nos campos da API Meta
- [x] Backend: procedure campaigns.list retorna os 12 campos obrigatórios por campanha
- [x] Frontend: tabela com 12 colunas fixas (Veiculação, Resultado, Custo/Resultado, Visitas Perfil, Alcance, Impressões, CPM, Cliques, CPC, CTR, Frequência, Seguidores)
- [x] Frontend: scroll horizontal para acomodar todas as colunas
- [x] Frontend: "—" para métricas não disponíveis (nunca ocultar coluna)
- [x] Frontend: ordem de colunas fixa e inalterável
- [x] Frontend: apenas campanhas ATIVAS + PAUSADAS nos últimos 7 dias

## Detecção de Anomalias — Validação Multi-Período
- [x] Backend: comparar métrica atual com médias de 7, 14 e 30 dias
- [x] Backend: anomalia confirmada apenas se ≥2 de 3 janelas detectarem desvio
- [x] Backend: thresholds diferenciados por categoria (custo, performance, entrega, frequência)
- [x] Backend: campanhas em aprendizado (<7 dias ou <50 eventos) isentas de alertas de métrica
- [x] Backend: campanhas com <7 dias de histórico usam threshold dobrado
- [x] Backend: monitorar apenas campanhas ATIVAS
- [x] Backend: estrutura do alerta inclui comparação das 3 janelas e X/3 confirmações
