# Guia de Configuracao - Google Ads API

## Pre-requisitos

Para integrar o Google Ads ao dashboard SELVA, voce precisa:

1. Conta MCC (My Client Center) - conta gerenciadora que acessa todas as contas dos clientes
2. Developer Token - obtido no Google Ads API Center
3. OAuth 2.0 Credentials - Client ID e Client Secret do Google Cloud Console

## Passo 1 - Criar projeto no Google Cloud Console

1. Acesse https://console.cloud.google.com
2. Crie um novo projeto: SELVA Dashboard
3. Ative a API Google Ads API
4. Em Credentials, crie um OAuth 2.0 Client ID (tipo: Web Application)
5. Adicione https://dashboardselva.manus.space/api/google-ads/callback como Redirect URI
6. Anote o Client ID e Client Secret

## Passo 2 - Obter Developer Token

1. Acesse sua conta MCC no Google Ads
2. Va em Ferramentas > Centro de API
3. Solicite um Developer Token (comeca como Test Account, depois solicita producao)
4. Anote o Developer Token

## Passo 3 - Obter Refresh Token

1. Use o OAuth Playground do Google: https://developers.google.com/oauthplayground
2. Configure com seu Client ID/Secret
3. Autorize o scope: https://www.googleapis.com/auth/adwords
4. Troque o authorization code por um Refresh Token
5. Anote o Refresh Token

## Passo 4 - Informacoes necessarias

Apos completar os passos acima, voce tera:

- Developer Token: Google Ads > Ferramentas > Centro de API
- Client ID: Google Cloud Console > Credentials
- Client Secret: Google Cloud Console > Credentials
- Refresh Token: OAuth Playground
- MCC Account ID: Tela principal do Google Ads MCC (formato: xxx-xxx-xxxx)

## Passo 5 - Listar contas dos clientes

Com o MCC configurado, informe os IDs das contas Google Ads de cada cliente.
Formato do ID: xxx-xxx-xxxx (encontrado no canto superior direito de cada conta)

## Proximos passos

Com essas credenciais, o dashboard sera atualizado para:
- Buscar campanhas, conjuntos e anuncios do Google Ads
- Unificar metricas Meta Ads + Google Ads em uma visao consolidada
- Suportar filtros por plataforma (Meta, Google, Todas)
