/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Onboarding — trilha de entrada de um colaborador
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas coisas moram aqui, e é de propósito que estejam separadas no arquivo:
 *
 *  1. MECÂNICA (tipos, datas dos checkpoints, o que é interativo). Estável.
 *  2. CONTEÚDO (as seções que a pessoa lê). Volátil — nasceu de um documento
 *     de trabalho que vai ser reescrito, e trocar o texto não pode obrigar a
 *     mexer em tabela, rota ou permissão.
 *
 *  ── Por que o conteúdo é dado tipado, e não Markdown ───────────────────────
 *  Porque o documento não é texto corrido: tem tabela, matriz de decisão,
 *  destaque de missão e cinco pontos onde a leitura vira interação. Markdown
 *  renderizado devolveria um blogpost; blocos tipados devolvem a identidade do
 *  portal, e deixam o compilador reclamar quando um bloco novo aparece.
 *
 *  ── O que NÃO é interativo, e por quê ──────────────────────────────────────
 *  "O que não esperamos nos primeiros 30 dias" e "a transição de especialista a
 *  gestora" são as duas partes mais fortes do documento, e as duas que perdem
 *  se virarem caixinha de marcar. São conversa, não tarefa. Ficam como leitura
 *  por decisão, não por falta de tempo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Mecânica ─────────────────────────────────────────────────────────────────

/** Onde uma seção de leitura vira estado guardado. */
export type Interativo = "ACESSOS" | "SEMANA1" | "CADERNO" | "PERGUNTAS" | "CHECKPOINTS";

export type Bloco =
  | { tipo: "texto"; texto: string }
  /** A frase que a pessoa deveria lembrar meses depois. Uma por seção, no máximo. */
  | { tipo: "destaque"; texto: string }
  | { tipo: "lista"; itens: { titulo?: string; texto: string }[] }
  | { tipo: "passos"; itens: { titulo: string; texto: string }[] }
  /** `pendente` marca conteúdo que ainda não foi preenchido — a tela mostra a lacuna como lacuna, em vez de fingir que está completa. */
  | { tipo: "tabela"; colunas: [string, string]; linhas: { a: string; b: string; pendente?: boolean }[] }
  | { tipo: "matriz"; grupos: { titulo: string; nivel: NivelDecisao; itens: string[] }[] };

/** Os quatro degraus da autonomia — a matriz da seção 4. */
export type NivelDecisao = "decide" | "comunica" | "consulta" | "escala";

export type Secao = {
  id: string;
  titulo: string;
  blocos: Bloco[];
  interativo?: Interativo;
};

export type Checkpoint = { chave: string; rotulo: string; foco: string; data: string };

const DIA_MS = 86_400_000;

/** `AAAA-MM-DD` → epoch em UTC. UTC de propósito: data aqui é chave, não instante. */
function diaParaUTC(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}
function utcParaDia(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
export function somarDias(dia: string, n: number): string {
  return utcParaDia(diaParaUTC(dia) + n * DIA_MS);
}
export function somarMeses(dia: string, n: number): string {
  const base = new Date(diaParaUTC(dia));
  const alvo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + n, 1));
  // Último dia do mês alvo — 31/08 + 6 meses cai em fevereiro, que não tem 31.
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return utcParaDia(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(base.getUTCDate(), ultimo)));
}
/** A sexta-feira da semana que começa em `dia`. Segunda + 4; outro dia, a sexta seguinte. */
export function sextaDaSemana(dia: string): string {
  const dow = new Date(diaParaUTC(dia)).getUTCDay(); // 0 dom … 6 sáb
  const faltam = (5 - dow + 7) % 7;
  return somarDias(dia, faltam);
}

/**
 * Os checkpoints são CALCULADOS a partir do primeiro dia, nunca gravados.
 *
 * Data derivada guardada é data que envelhece: se o início mudar (e muda — a
 * pessoa adia, a semana vira), uma cópia gravada continuaria apontando para o
 * combinado antigo sem ninguém perceber.
 */
export function checkpointsDaTrilha(dataInicio: string): Checkpoint[] {
  return [
    { chave: "dia1", rotulo: "Fim do 1º dia", foco: "Dúvidas, impressões, acessos, prioridades.", data: dataInicio },
    { chave: "semana1", rotulo: "Fim da 1ª semana", foco: "Leitura das contas, entendimento do time, lacunas de contexto.", data: sextaDaSemana(dataInicio) },
    { chave: "d30", rotulo: "30 dias", foco: "Organização, comunicação, domínio de prazos, antecipação, qualidade do acompanhamento.", data: somarDias(dataInicio, 30) },
    { chave: "d60", rotulo: "60–90 dias", foco: "Autonomia operacional, relação com clientes, mobilização do squad, visão estratégica.", data: somarDias(dataInicio, 60) },
    { chave: "m6", rotulo: "~6 meses", foco: "Assumir um projeto novo após a venda e conduzir com mínima dependência operacional.", data: somarMeses(dataInicio, 6) },
  ];
}

/** Quantos itens de um bloco interativo já foram marcados — o progresso do card da Home. */
export function progresso(itens: { feito: boolean }[]): { feitos: number; total: number; pct: number } {
  const total = itens.length;
  const feitos = itens.filter((i) => i.feito).length;
  return { feitos, total, pct: total === 0 ? 0 : Math.round((feitos / total) * 100) };
}

// ── Conteúdo (modelo GTM — v01, agosto/2026) ─────────────────────────────────
//
// Nasceu do documento de trabalho "Onboarding — Daniela". Trocar daqui para
// baixo não deveria exigir mudança em nenhum outro arquivo.

export const SEED_ACESSOS: string[] = [
  "Computador configurado e testado",
  "E-mail e calendário",
  "ClickUp e ferramentas de gestão",
  "Pastas e materiais das quatro contas",
  "Ferramentas de comunicação interna",
  "Plataformas de conteúdo, mídia e analytics das contas",
  "Apresentações padrão: kick-off, planejamento, relatório",
  "Contratos, escopos e histórico essencial das contas",
];

export const SEED_SEMANA1: { titulo: string; descricao: string }[] = [
  { titulo: "Selva", descricao: "Entender estrutura, pessoas, rituais e como decisões são tomadas." },
  { titulo: "Carteira", descricao: "Conhecer as quatro contas: escopo, histórico, stakeholders, momento, resultados, riscos." },
  { titulo: "Operação", descricao: "Mapear prazos, demandas em aberto, aprovações, dependências e próximos passos de cada conta." },
  { titulo: "Time", descricao: "Conhecer o Bad e os parceiros internos — função, capacidade, gargalos, dinâmica." },
  { titulo: "Clientes", descricao: "Participar das reuniões relevantes e começar a construir relação." },
  { titulo: "Gestão", descricao: "Chegar à segunda seguinte com leitura própria das prioridades e riscos." },
  { titulo: "Registro", descricao: "Anotar dúvidas, atritos e aprendizados da transição. Vamos usar isso nos 1:1s." },
];

export const PERGUNTAS_1A1: string[] = [
  "O que ainda está confuso na operação ou nas contas?",
  "Onde você tem contexto suficiente para decidir e onde ainda precisa de repertório?",
  "Qual conta exige mais atenção agora, e por quê?",
  "Que risco você enxerga antes de ele virar problema?",
  "Onde o time está perdendo tempo?",
  "Que conversa de liderança você está evitando?",
  "O que você mudaria na Selva se tivesse liberdade para testar agora?",
  "Em qual fundamento de liderança você quer focar neste ciclo?",
];

export const SECOES: Secao[] = [
  {
    id: "abertura",
    titulo: "Este documento é seu",
    blocos: [
      { tipo: "texto", texto: "Ele explica por que essa função existe, o que esperamos de você, o que você pode esperar da Selva e como vamos acompanhar sua evolução nos primeiros meses." },
      { tipo: "destaque", texto: "Não é um contrato fechado. É um ponto de partida — e a expectativa é que você o questione, discorde de partes e proponha mudanças. Vamos revisá-lo juntos em 90 dias." },
    ],
  },
  {
    id: "por-que",
    titulo: "Por que essa função existe",
    blocos: [
      { tipo: "texto", texto: "A Selva chegou num ponto em que a operação depende demais do diretor executivo para funcionar. Prazos, riscos e prioridades passam por ele mesmo quando não precisariam. Isso trava o crescimento da agência de dois lados: consome o tempo que deveria estar em expansão e decisão de alto valor, e impede que as lideranças desenvolvam domínio real sobre as próprias contas." },
      { tipo: "texto", texto: "A coordenação de GTM existe para resolver isso." },
      { tipo: "texto", texto: "Você entra assumindo uma função de liderança, atendimento e gestão operacional — e uma transição de carreira junto. Você é uma redatora sênior, com repertório de grandes agências, virando gestora. Essas duas coisas acontecem ao mesmo tempo, e nós sabemos disso." },
      { tipo: "texto", texto: "Sua senioridade também é um ativo cultural. Esperamos que você eleve a régua de profissionalismo, organização e responsabilidade da casa — trazendo o que funcionava nas agências grandes, sem importar a burocracia que não funcionava." },
      { tipo: "destaque", texto: "A função tem teto alto. O caminho se desenha pela entrega, não por promessa antecipada." },
    ],
  },
  {
    id: "missao",
    titulo: "Sua missão",
    blocos: [
      { tipo: "destaque", texto: "Aumentar a capacidade de gestão da Selva e reduzir a dependência operacional do diretor executivo, garantindo previsibilidade, direção e qualidade nas contas sob sua responsabilidade." },
      { tipo: "lista", itens: [
        { texto: "Ser dona do pulso das suas contas — prazos, demandas, riscos, prioridades e próximos passos." },
        { texto: "Atender clientes com postura sênior e construir confiança direta com eles." },
        { texto: "Mobilizar o squad para que a execução aconteça com qualidade e velocidade." },
        { texto: "Puxar o diretor executivo e a Casa de Criação como apoio estratégico — puxando a ajuda, não esperando ser puxada." },
        { texto: "Evoluir de uma leitura de social media para uma leitura completa de marketing: conteúdo, mídia paga, performance, resultado, percepção do cliente e negócio." },
      ] },
    ],
  },
  {
    id: "contas",
    titulo: "Suas contas e seu time",
    blocos: [
      { tipo: "tabela", colunas: ["Conta", "Momento atual"], linhas: [
        { a: "MUSA", b: "", pendente: true },
        { a: "PLAY", b: "", pendente: true },
        { a: "ARKA", b: "", pendente: true },
        { a: "UMDSA", b: "", pendente: true },
      ] },
      { tipo: "lista", itens: [
        { titulo: "Seu squad direto", texto: "Você e o Bad (design)." },
        { titulo: "Sua parceira de coordenação", texto: "Elizabeth, que cuida das demais contas da carteira. Cada uma é dona das suas contas, mas as duas são responsáveis pela inteligência da operação como um todo. Vocês participam juntas dos rituais de liderança — a dinâmica não deve virar duas apresentações isoladas." },
      ] },
    ],
  },
  {
    id: "decisao",
    titulo: "O que você decide, consulta e escala",
    blocos: [
      { tipo: "texto", texto: "Autonomia não é agir sozinha. É saber decidir, saber quando consultar e saber quando escalar. Este é o mapa inicial — ele se amplia conforme contexto e confiança se consolidam." },
      { tipo: "matriz", grupos: [
        { titulo: "Você decide sozinha", nivel: "decide", itens: [
          "Cronograma, ordem de execução e distribuição de trabalho dentro do seu squad.",
          "Aprovação final de peça que segue planejamento e régua já validados.",
          "Ajustes de rota em conteúdo dentro da linha aprovada.",
          "Resposta a dúvidas operacionais do cliente.",
          "Agenda, reuniões, formato de acompanhamento das suas contas.",
        ] },
        { titulo: "Você decide e comunica na segunda", nivel: "comunica", itens: [
          "Ajustes no calendário editorial dentro do mês.",
          "Remanejamento de verba entre campanhas já aprovadas, dentro do budget vigente.",
          "Feedback, cobrança e conversas de desenvolvimento com seus liderados.",
          "Aceitar uma demanda extra pequena que cabe no escopo.",
        ] },
        { titulo: "Você consulta antes", nivel: "consulta", itens: [
          "Mudança de direção criativa ou de posicionamento de uma conta.",
          "Formato, produto ou entrega não prevista no escopo.",
          "Alocação de pessoas que não são do seu squad.",
          "Prazo que vai estourar e precisa ser renegociado com o cliente.",
          "Resposta a uma insatisfação do cliente.",
          "Qualquer custo extra — freela, produção, ferramenta.",
        ] },
        { titulo: "Você escala na hora", nivel: "escala", itens: [
          "Risco real de perder a conta.",
          "Pedido do cliente com impacto comercial ou contratual.",
          "Qualquer conversa sobre valores, escopo de contrato ou renovação.",
          "Problema sério com alguém do time.",
          "Erro que já foi ao ar e afeta a marca do cliente.",
        ] },
      ] },
      { tipo: "destaque", texto: "Na dúvida, pergunte. Validar uma dúvida pequena é sempre melhor do que errar por falta de alinhamento. Ninguém aqui vai achar que perguntar é insegurança — desde que você chegue com contexto e, quando possível, com uma recomendação." },
    ],
  },
  {
    id: "esperamos",
    titulo: "O que esperamos de você",
    blocos: [
      { tipo: "lista", itens: [
        { titulo: "Organização absoluta", texto: "Saber o que precisa acontecer, quando, por quem e com quais dependências." },
        { titulo: "Visibilidade", texto: "Nenhum risco relevante pode ficar escondido ou aparecer tarde. Problema comunicado cedo é problema resolvido; comunicado tarde é crise." },
        { titulo: "Protagonismo", texto: "Diante de um problema, movimentar a solução — e pedir apoio quando precisar." },
        { titulo: "Pensamento crítico", texto: "Não parar em status de post. Entender resultado, mídia, cliente, momento da conta e oportunidade." },
        { titulo: "Postura sênior", texto: "Ser vetor de profissionalismo e responsabilidade para o time." },
        { titulo: "Liderança pelo exemplo", texto: "Desenvolver autonomia e comportamento no squad." },
        { titulo: "Atenção às reuniões", texto: "Registrar decisões e garantir que tudo saia com responsável e próximo passo." },
      ] },
    ],
  },
  {
    id: "esperar-da-selva",
    titulo: "O que você pode esperar da Selva",
    blocos: [
      { tipo: "lista", itens: [
        { titulo: "Clareza", texto: "Transparência sobre expectativas, prioridades e critérios de qualidade." },
        { titulo: "Apoio na curva", texto: "O diretor executivo próximo no aprendizado de estratégia digital e nas decisões de alto valor." },
        { titulo: "Repertório", texto: "Acesso à Casa de Criação e ao acervo criativo da agência, especialmente na implantação de contas novas." },
        { titulo: "Feedback frequente e específico", texto: "Baseado em comportamento observável, não em impressão." },
        { titulo: "Espaço para perguntar", texto: "Inclusive dúvidas pequenas." },
        { titulo: "Espaço real para mudar processo", texto: "Se algo aqui é ineficiente, você tem mandato para propor outra coisa." },
        { titulo: "Planejamento antes de esforço", texto: "Quando uma entrega importante entra em risco, a entrega vem primeiro — mas depois nós revisamos o que quebrou no sistema, e a correção é responsabilidade da agência, não sua. Emergência não pode virar método." },
        { titulo: "Autonomia crescente", texto: "Conforme contexto e critério se consolidam." },
      ] },
    ],
  },
  {
    id: "nao-esperamos",
    titulo: "O que NÃO esperamos nos primeiros 30 dias",
    blocos: [
      { tipo: "texto", texto: "Isso é tão importante quanto o resto." },
      { tipo: "lista", itens: [
        { texto: "Não esperamos que você domine mídia paga, performance ou leitura de resultado. Isso se constrói, e nós vamos construir junto." },
        { texto: "Não esperamos que você resolva sozinha problemas que já existiam antes de você chegar." },
        { texto: "Não esperamos plano estratégico pronto. Esperamos leitura e perguntas boas." },
        { texto: "Não esperamos que você aja com segurança que ainda não tem. Perguntar cedo é o comportamento certo." },
        { titulo: "Não esperamos que você produza", texto: "Você não é a redatora do squad. Se você está escrevendo, tem algo quebrado no sistema — e isso é pauta de 1:1, não de madrugada." },
      ] },
    ],
  },
  {
    id: "transicao",
    titulo: "A transição: de especialista a gestora",
    blocos: [
      { tipo: "texto", texto: "Essa é a parte mais difícil e a menos óbvia. O risco não é você falhar por incompetência. É você voltar para onde é boa — a execução — quando a gestão ficar desconfortável." },
      { tipo: "lista", itens: [
        { texto: "De “minha entrega” para “resultado da operação sob minha responsabilidade”." },
        { texto: "De fazer bem para criar clareza para outras pessoas — delegar e cobrar com contexto." },
        { texto: "De qualidade da peça para leitura de capacidade, produtividade e comportamento do time." },
        { texto: "De repertório criativo para repertório de estratégia, mídia e negócio." },
        { texto: "De reagir para antecipar, priorizar e escalar." },
        { texto: "De ser referência técnica para construir autoridade com clientes sem depender do diretor executivo como sensor ou cobrador." },
      ] },
      { tipo: "texto", texto: "Isso não acontece em 30 dias. Vamos tratar como desenvolvimento consciente: um fundamento prioritário por ciclo, discutido nos 1:1s." },
    ],
  },
  {
    id: "primeiro-dia",
    titulo: "Primeiro dia — segunda-feira",
    blocos: [
      { tipo: "texto", texto: "O primeiro dia coincide com o café/reunião mensal da Selva. A prioridade do dia é você conhecer pessoas e sair com o essencial funcionando — não absorver a operação inteira." },
      { tipo: "passos", itens: [
        { titulo: "Recepção e instalação", texto: "Computador, e-mail e acessos essenciais testados." },
        { titulo: "Café/reunião mensal", texto: "Integração com o time e leitura da dinâmica real da casa." },
        { titulo: "Apresentação da Selva", texto: "História, áreas, estrutura, clientes, tipos de trabalho." },
        { titulo: "Conversa de função", texto: "Este documento, lido e discutido junto. Missão, matriz de decisão, critérios de sucesso." },
        { titulo: "Uma conta em profundidade", texto: "Escolhemos a mais urgente e mergulhamos nela." },
        { titulo: "Fechamento com o diretor executivo", texto: "Dúvidas, impressões, o que ficou confuso e prioridades de terça." },
      ] },
      { tipo: "texto", texto: "O resto da carteira, a operação de GTM e os rituais entram distribuídos ao longo da semana." },
    ],
  },
  {
    id: "acessos",
    titulo: "Checklist de acessos",
    interativo: "ACESSOS",
    blocos: [
      { tipo: "texto", texto: "Metade disto é responsabilidade da Selva, não sua. Marque o que já estiver funcionando — o que ficar em aberto aparece para a administração." },
    ],
  },
  {
    id: "semana1",
    titulo: "Primeira semana",
    interativo: "SEMANA1",
    blocos: [],
  },
  {
    id: "caderno",
    titulo: "Seu caderno",
    interativo: "CADERNO",
    blocos: [
      { tipo: "texto", texto: "Dúvidas, atritos e aprendizados da transição. É seu: ninguém mais lê o que você escreve aqui, a não ser que você decida levar uma anotação para o 1:1." },
    ],
  },
  {
    id: "sucesso",
    titulo: "O que significa sucesso",
    blocos: [
      { tipo: "tabela", colunas: ["Horizonte", "Critério"], linhas: [
        { a: "30 dias", b: "Visibilidade e controle dos prazos e demandas das quatro contas. Comunica status e risco proativamente. Entende clientes, time e processos. Nenhum prazo de cliente é descoberto pelo diretor executivo antes de você." },
        { a: "60–90 dias", b: "Toca as contas sem que ninguém precise descobrir problemas, cobrar prazo ou movimentar o time por você. Pede ajuda cedo e chega com contexto e proposta. Relação direta com os clientes estabelecida." },
        { a: "~6 meses", b: "Um projeto novo pode ser vendido e onboardado pelo diretor executivo e depois assumido por você operacionalmente, com boa experiência do cliente, qualidade e mínima dependência dele." },
        { a: "Evolução", b: "Planos e estratégias chegam ao diretor executivo cada vez mais maduros. A direção estratégica segue compartilhada e validada por ele." },
      ] },
    ],
  },
  {
    id: "acompanhamento",
    titulo: "Como vamos acompanhar",
    interativo: "CHECKPOINTS",
    blocos: [
      { tipo: "lista", itens: [
        { titulo: "1:1 semanal", texto: "Nos primeiros 60 dias. Depois, quinzenal." },
        { titulo: "Encontro mensal de desenvolvimento", texto: "Separado da operação." },
      ] },
    ],
  },
  {
    id: "rituais",
    titulo: "Rituais",
    blocos: [
      { tipo: "texto", texto: "Você entra nos rituais de liderança da Selva a partir da primeira segunda-feira: reunião de antecipação (segunda), fechamento e aprendizagem (sexta), 1:1 e encontro mensal de desenvolvimento." },
      { tipo: "texto", texto: "O detalhamento de cada ritual, o radar da coordenação e a matriz de responsabilidades estão no Sistema Operacional de Liderança da Selva — documento complementar a este." },
    ],
  },
  {
    id: "perguntas",
    titulo: "Perguntas para os primeiros 1:1s",
    interativo: "PERGUNTAS",
    blocos: [
      { tipo: "texto", texto: "Pense nelas antes do encontro. O que você escrever aqui é seu — e só vai para o 1:1 se você mandar." },
    ],
  },
];
