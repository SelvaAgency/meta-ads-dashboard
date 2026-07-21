# Histórico de versões — SELVA Spaces

Registro do que mudou no sistema, explicado sem termos técnicos.
Período coberto: **13 a 21 de julho de 2026** (69 entregas).

Cada bloco responde três coisas: **o que mudou**, **por que mudou** e, quando
for o caso, **o que você precisa fazer**.

---

## Resumo do período

Em duas semanas o Spaces ganhou quatro frentes grandes:

1. **Controle Financeiro completo** — de uma tela simples para um sistema de
   receita, despesa, recorrência, fechamento de mês e análise de carteira.
2. **Notificações e alertas unificados** — um único lugar para comunicados,
   aniversários, Trello, financeiro e alertas de performance.
3. **Seção Site e Microsoft Clarity** — o Spaces passou a enxergar o site do
   cliente, não só os anúncios. O robô virou um analista da jornada inteira.
4. **Google Ads** — integração construída do zero, hoje **bloqueada por uma
   aprovação do Google** (detalhes no fim).

Mais uma correção de segurança e vários ajustes de uso no dia a dia.

---

## 21 de julho

### Google Ads: o erro agora aponta a causa certa
Quando a consulta ao Google falha por permissão, a mensagem passou a dizer o
motivo mais provável — **o nível do token de desenvolvedor** — em vez de mandar
procurar em login e permissões. Também passamos a capturar o código de rastreio
que o suporte do Google usa para investigar uma chamada específica.

**Por quê:** a mensagem antiga levava a investigar o lugar errado. Isso já custou
horas.

---

## 20 de julho

### Google Ads: a integração ganhou pé
Quatro entregas no mesmo dia, todas resolvendo travas encontradas em produção:

**A versão da API estava aposentada.** O Google desativa cada versão depois de
cerca de um ano. A nossa estava morta havia tempo e o sintoma parecia erro de
senha. Atualizamos e deixamos a versão configurável, para atualizar no futuro
sem precisar de nova entrega.

**A conexão passou a ser da agência, não de uma pessoa.** Antes, quem conectasse
o Google Ads conectava só para si — outro usuário via "sem permissão". Agora a
conexão é única e vale para todo o Spaces.

**Vínculo entre conta do Google e cliente do Spaces.** O MCC da agência tem ~26
contas e nós temos ~10 clientes ativos. Administradores e desenvolvedores
descobrem as contas e escolhem, numa tabela, qual conta pertence a qual cliente.
Contas que não interessam podem ser marcadas como ignoradas. Usuário comum não
vê essa tela — vê apenas os dados do cliente dele.

**Campanhas pausadas voltaram a aparecer.** A lista escondia tudo que não
estivesse ativo naquele instante, então quem pausou a campanha achava que os
dados tinham sumido. Agora aparece tudo, com selo de *Ativa* ou *Pausada*.

**Erro deixou de se disfarçar de "sem dados".** Se a consulta ao Google falha, a
tela diz que falhou e mostra o motivo. Antes aparecia "nenhuma campanha", que é
uma resposta diferente e mandava investigar o lugar errado. Junto veio um painel
de diagnóstico técnico, visível só para admin e desenvolvedor.

**Nomes das contas.** O Google devolve só números na listagem inicial. Passamos
a buscar o nome real de cada conta, com uma segunda tentativa quando a primeira
não traz.

### Conectar o Google não abre mais dentro do quadro
O login do Google era bloqueado com erro 403 porque abria dentro do quadro
interno do Tracker — o Google não permite isso. Agora abre na página inteira e
volta sozinho para a tela do Google Ads.

---

## 17 de julho

### Notificações mudaram de lugar
As preferências de notificação e o resumo diário saíram das configurações do
Tracker e foram para as **Configurações do Spaces**, que é onde as pessoas
procuravam. Comunicados e aniversários passaram a ser marcados como
institucionais — só quem tem permissão edita.

### Troca de cliente mantém a seção
Ao trocar de cliente, você continua na mesma seção, só com os dados do outro
cliente. Antes voltava sempre para a Visão Geral, o que obrigava a navegar de
novo até onde você estava.

### Personalização da visão por botões
A ordenação dos blocos da tela inicial passou a ser feita por botões **subir /
descer**. O arrastar-e-soltar anterior não funcionava — e havia um segundo
problema escondido: mesmo salvando a ordem, a tela desenhava os blocos sempre na
mesma sequência. Os dois foram corrigidos.

### Relatório modular voltou a ser visual
O relatório tinha virado texto corrido. Voltou a ter indicadores em destaque,
gráfico e cards — formato de apresentação, não de documento.

### Meta Ads e Google Ads em abas separadas
A tela de campanhas ganhou subabas, para os dois canais não se misturarem.

### Google Ads: conexão por OAuth
Você conecta a conta do Google pelo próprio Spaces, clicando. Não é mais preciso
gerar credenciais manualmente e colar em configuração de servidor. A credencial
fica guardada **criptografada** e nunca aparece em tela nem em registro de log.

---

## 16 de julho

### O site do cliente entrou no Spaces
Nova seção **Site**, com desempenho técnico (PageSpeed nas quatro categorias),
segurança básica e disponibilidade. O bloco de Site foi depois dissolvido dentro
da Visão Geral, com um filtro **Todos / Mídia / Site**, para não criar uma ilha
separada.

### Correção crítica: a seção Site quebrava
A aba de Performance recebia, por engano, uma medição de segurança — que não tem
os números de performance. A tela quebrava inteira. Além de corrigir a origem,
todos os números da seção passaram a ser exibidos com segurança: quando o dado
não existe, aparece um traço (—) em vez de derrubar a página.

### O robô virou um analista da jornada inteira
Antes o robô olhava só a mídia. Agora enxerga **mídia + site** na mesma análise.
Quando falta alguma fonte, ele diz explicitamente "sem dados" e o motivo — em
vez de simplesmente omitir, que é o comportamento que faz um relatório parecer
completo quando não está.

### Gerador de relatório modular
Você monta o relatório escolhendo os blocos, sobre a mesma base que o robô usa.

### Sidebar e presença
Cabeçalho maior, botão de recolher que realmente fecha, Jornalzinho no menu e
indicador de quem está online, tudo em uma linha só.

### Tracker só abre dentro do Spaces
As telas internas passaram a abrir sempre dentro do Spaces, mantendo o menu e o
cliente selecionado. Clicar num cliente já abre o Tracker naquele cliente.

### Alertas por cliente e exclusão anônima
Os alertas passaram a ser listados por cliente. A exclusão permanente de usuário
passou a anonimizar os registros, preservando o histórico sem manter o dado
pessoal.

---

## 16 de julho — segurança

### Credencial do Google exposta no código
Encontramos uma **senha de aplicativo do Google escrita direto no código**. Como
o repositório é público, foi tratada como credencial vazada: removida de dois
arquivos, passou a vir apenas de configuração protegida, e o sistema agora
**falha com mensagem clara** se ela faltar — em vez de tentar seguir com uma
credencial fantasma.

**Ação recomendada:** trocar essa credencial no Google Cloud. Já confirmamos que
ela é diferente da credencial do Calendar, então a troca não afeta a agenda.

---

## 15 de julho

### Sistema de notificações unificado
Um único lugar reúne comunicados, Trello, aniversários, financeiro e alertas de
performance, com filtros e agrupamento. Coordenadores de cliente passaram a
receber os alertas do cliente deles. O envio diário foi corrigido para **9h25**
(estava saindo às 6h25 por causa de fuso horário implícito).

### Microsoft Clarity por cliente
Nova aba no Tracker com os dados de comportamento no site, configurável por
cliente, com chat contextual e o **Relatório de Site & Jornada**. Alertas de site
passaram a chegar para administradores e coordenadores.

---

## 13 a 15 de julho — Controle Financeiro

A maior frente do período. O Financeiro saiu de uma tela simples e virou um
sistema:

**Estrutura.** Quatro abas — Visão Geral, Clientes e Projetos, Despesas, Gui &
SELVA — com um botão "+ Novo" unificado.

**Receita e previsão.** Contratos por cliente e mês, projetos parcelados,
previsto × confirmado aplicado de forma consistente em todos os gráficos, e o
gráfico "falta receber por mês".

**Despesas.** Hub próprio, espelhando o de receita: recorrência automática,
despesa pontual com subcategorias, reembolsos e vencimentos.

**Fechamento de mês.** Depois de conciliado, o mês trava para edição — o que
impede que um número já fechado mude sem querer.

**Análise da carteira.** Indicadores, quadrante de clientes, composição por
pizza e saídas recentes. O cálculo de churn foi refeito para significar o que o
nome diz.

**Correções.** Uma quebra de tela no Financeiro e a renderização fora do lugar
(aparecia sem o menu do Spaces).

---

## 13 de julho — usuários

O **cargo do usuário passou a valer o que está cadastrado**. Antes, o login e a
rotina de carga podiam reverter um cargo alterado à mão. Também entraram travas
contra sobrescrita acidental de dados de usuário.

---

## Situação do Google Ads (21/07)

A integração está **pronta e conectada**. O que falta não depende de nós:

| Item | Situação |
|---|---|
| Conexão com o Google | ✅ conectada como `contato@selva.agency` |
| Acesso ao MCC da agência | ✅ comprovado — a descoberta listou 26 contas |
| Vínculo conta ↔ cliente | ✅ funcionando |
| Consulta de campanhas | ⛔ recusada pelo Google |

**Motivo:** o token de desenvolvedor está em **nível de teste**, que só consulta
contas de teste. Contra conta real, o Google recusa — mesmo com tudo o mais
correto.

**Ação:** solicitar o **Acesso Básico** na Central de API do Google Ads. Quando
for aprovado, as campanhas devem aparecer sozinhas, sem nova entrega.

**Dois ajustes que dependem de você, na tela do Google Ads:**

1. A conta `9284868244` está vinculada ao cliente *CA - SELVA Agency*, mas esse
   número é a **conta gerenciadora (MCC)** — gerenciadora não tem campanhas, então
   esse vínculo nunca mostraria dados. Vale desvincular ou ignorar. É resquício
   de uma descoberta antiga, feita antes do filtro que exclui o MCC.
2. Clicar em **"Descobrir contas"** uma vez, para trocar os nomes genéricos
   (`Google Ads 8184107035`) pelos nomes reais. Os vínculos já feitos são
   preservados.

---

## O que ficou adiado

- **Instagram** — integração real adiada, aguardando revisão do aplicativo junto
  à Meta. Os requisitos já foram levantados.
