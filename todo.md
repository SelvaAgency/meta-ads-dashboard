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
