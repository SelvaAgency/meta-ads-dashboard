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
