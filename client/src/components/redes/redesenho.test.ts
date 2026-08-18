/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que o redesenho não pode desfazer
 * ─────────────────────────────────────────────────────────────────────────────
 *  Redesenho é a rodada em que mais se perde dado sem querer: um card fica mais
 *  limpo porque uma métrica saiu, um gráfico fica mais bonito porque a ressalva
 *  foi embora. Estes testes guardam três coisas que o compilador não vê.
 *
 *   PALETA ÚNICA     duas listas de cor para as mesmas métricas divergem na
 *                    primeira mudança, e aí o roxo do gráfico deixa de ser o
 *                    roxo do card — a paleta funcional para de funcionar
 *                    exatamente onde ela existe para ajudar
 *
 *   NENHUMA MÉTRICA  a faixa geral tem cinco, e todas continuam lá. Um card que
 *   SUMIU            desaparece num redesenho não deixa rastro nenhum
 *
 *   RETENÇÃO SEM     não há dado de retenção. Uma curva desenhada ali seria lida
 *   CURVA            como medição, e ninguém conferiria
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COR, COR_TIPO } from "@shared/coresSociais";

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
const fonte = (p: string) => semComentarios(readFileSync(new URL(p, import.meta.url), "utf-8"));

const pagina = () => fonte("../../pages/RedesSociais.tsx");
/* Os três gráficos vivem num arquivo só desde a aplicação do protótipo —
   `GraficoDaConta.tsx` foi substituído por `GraficosSociais.tsx`. */
const grafico = () => fonte("./GraficosSociais.tsx");
const retencao = () => fonte("./RetencaoReels.tsx");
const conteudo = () => fonte("./PublicacoesEConteudo.tsx");
const cabecalho = () => fonte("./CabecalhoDaConta.tsx");
const rascunho = () => fonte("../../pages/rascunho/CabecalhoExecutivoSocial.tsx");
/** O núcleo puro da retenção — as proibições valem lá também. */
const leia = (p: string) => fonte(p);

describe("a paleta é única", () => {
  /** Cada família tem UM matiz, e ele mora num lugar só. */
  it("gráficos e cards leem de shared/coresSociais", () => {
    expect(grafico()).toContain("@shared/coresSociais");
    expect(pagina()).toContain("@shared/coresSociais");
    expect(conteudo()).toContain("@shared/coresSociais");
  });

  /**
   * O erro concreto: um `#8B5CF6` sobrevivendo num componente depois de a paleta
   * ter mudado para `#7C5CE0`. O gráfico ficaria com o roxo antigo e o card com
   * o novo, e a mesma métrica teria duas cores na mesma tela.
   */
  it("nenhum componente redeclara hex de métrica", () => {
    for (const [nome, f] of [["gráfico", grafico], ["página", pagina]] as const) {
      const s = f();
      for (const hex of Object.values(COR)) {
        // O hex pode aparecer, mas não numa constante local de cor.
        expect(s, `${nome} redeclarou ${hex}`).not.toMatch(
          new RegExp(`const\\s+COR_?\\w*\\s*[:=][^;]*${hex}`, "i"));
      }
    }
  });

  it("todo tipo de conteúdo tem cor", () => {
    for (const t of ["FEED", "CARROSSEL", "REELS", "STORY", "ANUNCIO", "DESCONHECIDO"] as const) {
      expect(COR_TIPO[t]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("nenhuma métrica saiu da faixa geral", () => {
  /**
   * As cinco de antes continuam na tela — três viraram cartão, duas viraram
   * sub-métrica, e uma virou parcela. O que o guarda impede é o caso em que
   * "reagrupar" foi na verdade sumir com o número.
   */
  it("as cinco continuam sendo montadas", () => {
    const s = pagina();
    for (const r of ["Ativações", "Engajamento", "Visitas ao perfil", "Cliques no link"]) {
      expect(s, `"${r}" saiu da faixa`).toMatch(new RegExp(`rotulo="${r}"`));
    }
    // Respostas aos stories: parcela do engajamento, não cartão.
    expect(s, "respostas aos stories saíram do engajamento").toContain("replies: respostas.total");
    expect(s, "respostas aos stories voltaram a ser cartão")
      .not.toContain('rotulo="Respostas aos Stories"');
  });

  /** Visitas e cliques dividem cartão, mas nunca o número. */
  it("interações com o perfil agrupa sem somar", () => {
    const s = pagina();
    expect(s).toContain("Interações com o perfil");
    expect(s).toMatch(/MetricaDoPerfil[^>]*rotulo="Visitas ao perfil"[\s\S]*?valor=\{fmt\(visitas\.total\)\}/);
    expect(s).toMatch(/MetricaDoPerfil[^>]*rotulo="Cliques no link"[\s\S]*?valor=\{fmt\(cliques\.total\)\}/);
    // A soma das duas seria uma métrica que ninguém mede.
    expect(s).not.toMatch(/visitas\.total\s*\+\s*cliques\.total/);
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   *  A caixa executiva é UMA caixa
   * ───────────────────────────────────────────────────────────────────────────
   *  Dados gerais e movimento da base eram duas seções empilhadas que ocupavam
   *  a tela inteira antes da primeira publicação. O guarda impede que voltem a
   *  se separar — e o jeito mais provável de isso acontecer é alguém envolver um
   *  dos dois num `<Secao>` de novo, sem perceber que a caixa é a decisão.
   */
  it("dados gerais e movimento dividem uma caixa só", () => {
    const s = pagina();
    expect(s, "movimento da base virou seção própria de novo")
      .not.toMatch(/<Secao\s+titulo="Movimento da base"/);
    expect(s, "dados gerais virou seção própria de novo")
      .not.toMatch(/<Secao\s+titulo="Dados gerais"/);
    // Os dois títulos vivem no mesmo trecho, sem `</section>` entre eles: é
    // isso que faz deles duas regiões de uma caixa em vez de duas caixas.
    const a = s.indexOf(">Dados gerais<");
    const b = s.indexOf(">Movimento da base<");
    expect(a, "título 'Dados gerais' desapareceu").toBeGreaterThan(-1);
    expect(b, "título 'Movimento da base' desapareceu").toBeGreaterThan(a);
    const entre = s.slice(a, b);
    expect(entre, "uma caixa fechou entre os dois").not.toContain("</section>");
    expect(s.slice(b), "o gráfico saiu da região do movimento").toContain("<GraficoDaEvolucaoDaBase");
  });

  /**
   * O SVG escala uniformemente, então um viewBox de 760 numa coluna de 376px
   * reduz o rótulo do eixo de 9px para ~4,5px. Compactar sem passar `largura`
   * seria trocar espaço por ilegibilidade — o oposto do que se pediu.
   */
  it("o movimento compacto encolhe o viewBox, não só a coluna", () => {
    expect(pagina()).toMatch(/<GraficoDaEvolucaoDaBase[^>]*largura=\{\d+\}/);
  });

  /**
   * O painel contextual, que nasceu em Cliques no link, passou a valer para
   * TODA métrica da faixa: "como isso evoluiu?" é a mesma pergunta em qualquer
   * uma delas, e quatro painéis diferentes com a mesma forma seriam quatro
   * lugares para a decisão de quebrar a linha num dia sem coleta escorregar.
   */
  it("toda métrica da faixa abre painel de evolução", () => {
    const s = pagina();
    for (const r of ["Ativações", "Engajamento", "Visitas ao perfil", "Cliques no link"]) {
      expect(s, r).toMatch(new RegExp(`<PainelDaMetrica[^>]*rotulo="${r}"`));
    }
    // Cliques continua sem cartão próprio: é o menor número da faixa.
    expect(s).not.toMatch(/<CartaoGeral[^>]*rotulo="Cliques no link"/);
    // A série do painel guarda `null` no dia sem medição: interpolar desenharia
    // uma inclinação que ninguém mediu.
    expect(s).toContain('valor: mets(p, k)');
  });

  /** As ressalvas são o que separa "medido zero" de "não medido". */
  it("as ressalvas de disponibilidade sobreviveram", () => {
    const s = pagina();
    expect(s).toContain("publicações indisponíveis nesta coleta");
    expect(s).toContain("sem medição de stories");
    expect(s).toContain("rotuloVisitas.resumo");
    // A ressalva das respostas mudou de lugar junto com a métrica: agora é a
    // composição do engajamento que diz quando elas não foram medidas.
    expect(s).toContain("composicao.ressalva");
  });

  /**
   * O total de interações saiu da grade e virou composição.
   *
   * "389 interações" escondia o que separa um post que gerou conversa de um que
   * só levou curtida. O bruto não sumiu: virou o hover da taxa, que é onde ele
   * explica de onde o percentual veio — a taxa é ele dividido pelo alcance.
   */
  it("a publicação mostra a composição, e o bruto no hover da taxa", () => {
    const s = conteudo();
    for (const r of ["alcance", "taxa", "views"]) {
      expect(s).toContain(`rotulo="${r}"`);
    }
    expect(s, "o total voltou a ocupar uma coluna").not.toContain('rotulo="interações"');
    expect(s).toContain("composicaoDoEngajamento(");
    expect(s).toContain("interações no total");
  });

  /**
   * Parcela ausente não vira zero — a regra vem de `composicaoDoEngajamento`, e
   * o cartão a reusa em vez de reimplementar. Duas implementações da mesma
   * decisão é como uma delas escorrega para `?? 0`.
   */
  it("as parcelas do engajamento vêm da função pura, e não de um mapa local", () => {
    const s = conteudo();
    expect(s).not.toMatch(/curtidas\s*\?\?\s*0/);
    expect(s).not.toMatch(/salvamentos\s*\?\?\s*0/);
    expect(s).toContain("partes.map");
  });
});

describe("os gráficos reproduzem o protótipo, não o recharts", () => {
  /**
   * O protótipo desenha em SVG direto, e o código dele é a especificação:
   * espessura 2.2, grade pontilhada 3-4, eixo do meio a 56%, barras a 42% e 62%
   * do passo. Em recharts, cada um desses seria uma briga com o default — e o
   * resultado ficaria "parecido".
   */
  it("as medidas do protótipo estão no código", () => {
    const s = grafico();
    expect(s).toContain('strokeDasharray="3 4"');
    // A espessura 2,2 do protótipo sobrevivia só na linha de saldo do
    // movimento, que foi removida. A da evolução foi a 2,6 de propósito — numa
    // coluna estreita as duas séries se cruzam muito.
    expect(s).toContain("strokeWidth={2.6}");
    // As larguras de barra saem do PASSO horizontal, e não de um número fixo:
    // com 30 dias, uma largura fixa faria as barras se encavalarem.
    expect(s).toMatch(/passo \* 0\.62/);
  });

  /**
   * O eixo em torno do zero saiu junto com as barras divergentes, em 18/08/2026.
   * O que sobrou é a evolução da base, cujo eixo enquadra o INTERVALO medido —
   * e é ali que a armadilha equivalente mora: ancorar no zero desenharia uma
   * reta horizontal, porque 20 de variação somem dentro de 9.400 seguidores.
   */
  it("o eixo da evolução enquadra o intervalo, e não o zero", () => {
    const s = grafico();
    const corpo = s.slice(s.indexOf("export function GraficoDaEvolucaoDaBase"));
    expect(corpo).toContain("const min = Math.min(...totais)");
    expect(corpo).toContain("const max = Math.max(...totais)");
    expect(corpo, "o eixo voltou a ser ancorado no zero").not.toMatch(/piso\s*=\s*0\b/);
  });

  /**
   * A linha roxa desenha o SALDO — a variação medida. Plotar o estoque de
   * seguidores foi o erro que fazia +2 entradas e −2 saídas parecerem
   * crescimento, com a legenda dizendo "Saldo" o tempo todo.
   */
  /**
   * ───────────────────────────────────────────────────────────────────────────
   *  O movimento não desenha saldo — nem como linha, nem como ponto
   * ───────────────────────────────────────────────────────────────────────────
   *  Entradas e saídas são FLUXO diário; saldo é ESTOQUE acumulado. Os três no
   *  mesmo eixo diziam ao olho que são comparáveis. O saldo do dia continua
   *  existindo no hover, como informação derivada — o que ele não faz mais é
   *  ocupar o eixo.
   *
   *  O jeito de isso voltar é alguém achar que "falta o saldo no gráfico". Ele
   *  não falta: está no número grande SALDO ATUAL, logo ao lado.
   * ───────────────────────────────────────────────────────────────────────────
   */
  /**
   * O bloco tem UM gráfico, e ele lê o total.
   *
   * As barras de variação diária saíram: a curva já mostra onde a base subiu e
   * onde caiu, e os extremos que elas davam de relance viraram números no
   * rodapé. Se um segundo gráfico voltar, volta a mistura de fluxo e estoque que
   * derrubou duas versões seguidas deste card.
   */
  it("a evolução da base é o único gráfico do bloco", () => {
    const s = pagina();
    const bloco = s.slice(s.indexOf(">Movimento da base<"),
      s.indexOf("</section>", s.indexOf(">Movimento da base<")));
    expect(bloco).toContain("<GraficoDaEvolucaoDaBase");
    expect(bloco, "as barras de variação diária voltaram").not.toContain("<GraficoDeVariacaoDiaria");
    expect(bloco, "voltou a haver dois gráficos").not.toMatch(/<Grafico\w+[\s\S]*<Grafico\w+/);
  });

  it("a curva lê o total, e não a variação", () => {
    const corpo = grafico().slice(grafico().indexOf("export function GraficoDaEvolucaoDaBase"));
    expect(corpo).toContain("d.total");
    expect(corpo, "a curva voltou a desenhar variação").not.toContain("d.variacao");
  });

  /**
   * Nada do que as barras mostravam se perdeu: os dois extremos e a média
   * continuam na tela, agora como números com data.
   */
  it("os extremos que as barras davam continuam no rodapé", () => {
    const s = pagina();
    expect(s).toContain("Maior alta");
    expect(s).toContain("Maior queda");
    expect(s).toContain("Média diária");
    expect(s).toContain("destaquesDoMovimento(");
  });

  /**
   * A regra que o diagnóstico de 18/08/2026 impôs: entradas e saídas não têm
   * fonte, então não aparecem. Se voltarem, voltam como número medido — e
   * ninguém confere de onde saiu.
   */
  it("entradas e saídas não voltam para o bloco", () => {
    const s = pagina();
    const bloco = s.slice(s.indexOf(">Movimento da base<"), s.indexOf("</section>", s.indexOf(">Movimento da base<")));
    expect(bloco, "ENTRARAM voltou").not.toContain("Entraram");
    expect(bloco, "SAÍRAM voltou").not.toContain("Saíram");
    expect(bloco).not.toContain("movimento.entradas");
    expect(bloco).not.toContain("movimento.saidas");
    // O que fica é o que se mede.
    expect(bloco).toContain("movimento.saldoAtual");
    expect(bloco).toContain("movimento.saldo");
    expect(bloco).toContain("followers_count");
  });

  /** Nenhuma derivação de breakdown alimenta o gráfico. */
  it("o gráfico não toca follows_and_unfollows nem o breakdown", () => {
    const s = pagina();
    const serie = s.slice(s.indexOf("const variacaoDiaria"), s.indexOf("const leituraDoVinculo"));
    expect(serie).toContain("total: p.seguidores");
    for (const proibido of ["follows_and_unfollows", "FOLLOWER", "NON_FOLLOWER", "follower_count"]) {
      expect(serie, proibido).not.toContain(proibido);
    }
  });

  /**
   * O erro original: a série chamada "Saldo" plotava `p.total` — o ESTOQUE de
   * seguidores, 9.464 — num eixo próprio auto-escalado, enquanto a legenda
   * dizia saldo. Duas grandezas sob um rótulo só.
   *
   * A linha morreu, mas a armadilha não: qualquer série deste bloco que leia o
   * total em vez da variação repete o mesmo engano numa forma nova.
   */

  /** A pilha vem da função pura — somar altura a altura deixa fresta no topo. */
  it("as ativações empilham por frações que somam 1", () => {
    const s = grafico();
    expect(s).toContain("pilhaDoDia");
    expect(s).toMatch(/s\.ate - s\.de/);
  });

  /** Buraco de coleta CORTA a linha — ligar desenharia o que ninguém mediu. */
  it("dia sem coleta quebra a linha em segmentos", () => {
    expect(grafico()).toMatch(/atual\.length > 1/);
  });

  it("nenhum gráfico da Social usa recharts", () => {
    expect(grafico()).not.toContain("recharts");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A retenção passou a ter dado — e as proibições continuam
 * ─────────────────────────────────────────────────────────────────────────────
 *  O guarda antigo exigia a frase "dado ainda não disponível", porque era isso
 *  que a tela dizia. A sondagem de 17/08/2026 devolveu PARCIAL e a decisão
 *  mudou; a INTENÇÃO não. Ela sempre foi: nenhuma curva inventada, nenhuma
 *  precisão fabricada.
 *
 *  Agora ela tem duas metades. A curva continua proibida — a Meta enumerou os
 *  breakdowns válidos e nenhum é temporal. E entrou uma proibição nova, que a
 *  execução real tornou concreta: nada pode ser derivado de `total_views`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("a retenção de Reels não ganha curva", () => {
  /** Uma linha ali seria lida como medição por segundo. */
  it("nenhuma curva desenhada no componente", () => {
    const s = retencao();
    expect(s).not.toMatch(/<(path|polyline|Line|Area)\b/);
    // Barra tem largura em %; curva tem série de pontos.
    expect(s).not.toMatch(/\bd=\{/);
  });

  /**
   * A proibição que a execução real tornou concreta: `tempo total ÷ views` deu
   * 7.957 espectadores implícitos contra 54.977 medidos. Nenhuma métrica de
   * views é o denominador do tempo médio, e dividir uma pela outra produziria
   * um número com cara de taxa e sem significado.
   */
  it("nenhuma métrica é derivada de views", () => {
    for (const s of [retencao(), leia("../../../../shared/retencaoDeReels.ts")]) {
      expect(s).not.toMatch(/\/\s*(m\.)?views\b/);
      expect(s).not.toMatch(/\bviews\s*\*/);
      expect(s).not.toMatch(/avgWatchTime\w*\s*\/\s*\w*[Vv]iews/);
      expect(s).not.toMatch(/skipRate\s*[*/]/);
    }
  });

  /** A nota que impede a leitura de que o Spaces sabe onde as pessoas saem. */
  it("a nota sobre não estimar curva está na tela", () => {
    expect(leia("../../../../shared/retencaoDeReels.ts"))
      .toContain("não estima uma curva de retenção por segundo");
    expect(retencao()).toContain("NOTA_DA_RETENCAO");
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   *  A seção não pode voltar a crescer sem teto
   * ───────────────────────────────────────────────────────────────────────────
   *  Uma conta com 30 Reels empurrava o resto da Social para fora da tela. O
   *  colapso e a rolagem interna são as duas peças que resolvem isso, e as duas
   *  somem fácil numa refatoração: quem tira o `max-h` para "mostrar tudo"
   *  devolve o problema inteiro, e a tela continua parecendo certa em contas
   *  pequenas — que é onde ela vai ser testada.
   * ───────────────────────────────────────────────────────────────────────────
   */
  it("a seção é colapsável e lembra a escolha", () => {
    const s = retencao();
    expect(s).toContain("localStorage.getItem");
    expect(s).toContain("localStorage.setItem");
    expect(s).toContain("aria-expanded");
    // Fechada por padrão: o resumo responde sozinho, e abrir é aprofundamento.
    expect(s).toMatch(/getItem\(CHAVE\) === "1"/);
    expect(s).toMatch(/return false;/);
  });

  it("a lista de Reels tem altura teto e rolagem própria", () => {
    const s = retencao();
    expect(s, "sem max-h a altura volta a crescer com o número de Reels")
      .toMatch(/max-h-\[\d+px\][^"]*overflow-y-auto/);
    // E a rolagem é só vertical: horizontal na página era proibição explícita.
    expect(s).toContain("overflow-x-hidden");
  });

  /**
   * O resumo recolhido precisa RESPONDER. Um título com seta transformaria o
   * clique em pedágio para saber se a retenção está boa.
   */
  it("o estado recolhido já traz os números e as duas pontas", () => {
    const s = retencao();
    for (const r of ["Reels analisados", "Abandono médio", "Tempo médio", "Visualizações"]) {
      expect(s, r).toContain(r);
    }
    expect(s).toContain("Menor abandono");
    expect(s).toContain("Maior abandono");
    expect(s).toContain("resumo.menorTaxa");
    expect(s).toContain("resumo.maiorTaxa");
  });

  /** Ausência dita, e nunca zero — a exigência sobreviveu à compactação. */
  it("ausência continua explícita depois do redesenho", () => {
    const s = retencao();
    expect(s).toContain("indisponível nesta coleta");
    expect(s).not.toMatch(/skipRate\s*\|\|\s*0/);
    expect(s).not.toMatch(/avgWatchTimeMs\s*\|\|\s*0/);
    expect(s).not.toMatch(/views\s*\?\?\s*0/);
  });

  /** O ranking sai da taxa, e de nada mais. */
  it("o ranking ordena exclusivamente por skipRate", () => {
    const s = leia("../../../../shared/retencaoDeReels.ts");
    const corpo = s.slice(s.indexOf("export function rankingDeAbandono"));
    expect(corpo).toContain("skipRate as number");
    expect(corpo).not.toContain("avgWatchTimeMs");
    expect(corpo).not.toContain("views");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O cabeçalho pertence ao mesmo dashboard que está abaixo dele
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ele era editorial e monocromático enquanto o resto da página era painel. A
 *  correção tem duas partes que somem fácil: a semântica de cor (família no
 *  ponto, direção no número) e a altura fixa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  As duas abas, e o que cada uma responde
 * ─────────────────────────────────────────────────────────────────────────────
 *  A Social empilhava numa rolagem só duas perguntas diferentes. A separação é
 *  de NAVEGAÇÃO, nunca de informação — e o jeito de ela virar perda é alguém
 *  "limpar" a Home e um bloco não reaparecer do outro lado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("a Social tem duas abas, e nada se perdeu entre elas", () => {
  it("a Home responde 'o que aconteceu' — dados gerais e publicações", () => {
    const s = pagina();
    const home = s.slice(s.indexOf('aba === "home" && ('), s.indexOf('aba === "conteudo" && ('));
    expect(home).toContain("Dados gerais");
    expect(home).toContain("<GraficoDaEvolucaoDaBase");
    expect(home).toContain("<UltimasPublicacoes");
    // Análise de conteúdo NÃO mora na Home.
    expect(home).not.toContain("<RetencaoReels");
    expect(home).not.toContain("<PerformanceDeConteudo");
  });

  it("Conteúdo responde 'qual conteúdo explica' — e recebe os três blocos", () => {
    const s = pagina();
    const conteudo = s.slice(s.indexOf('aba === "conteudo" && ('));
    expect(conteudo).toContain("<RetencaoReels");
    expect(conteudo).toContain("<PerformanceDeConteudo");
  });

  /** Uma aba só é destino de link se o nome dela sobreviver na URL. */
  it("a aba nasce da URL, e desconhecido não dá tela vazia", () => {
    expect(pagina()).toContain("abaDaUrl(");
  });

  /**
   * "Ativações por dia" era uma seção de largura cheia para responder uma
   * pergunta que pertence ao cartão de Ativações. Se ela voltar como seção, a
   * página volta a crescer — e o cartão passa a ter um irmão redundante.
   */
  it("ativações por dia vive DENTRO do cartão, e não como seção", () => {
    const s = pagina();
    expect(s).not.toMatch(/<Secao\s+titulo="Ativações por dia"/);
    expect(s, "o mini-gráfico saiu do cartão").toMatch(/grafico=\{<GraficoDeAtivacoes[^>]*compacto/);
  });

  /** O nome mudou porque o antigo mentia de leve — ver o comentário no arquivo. */
  it("a seção se chama Publicações do período", () => {
    expect(conteudo()).toContain(">Publicações do período<");
    expect(conteudo()).not.toMatch(/>Últimas publicações</);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O Rascunho preserva a peça MONTADA, e não comentada
 * ─────────────────────────────────────────────────────────────────────────────
 *  A diferença entre preservado e arquivado: este é exercitado a cada visita. Se
 *  o cabeçalho executivo quebrar por outra mudança, alguém descobre no Rascunho
 *  — não no dia em que ele voltar à produção.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("o cabeçalho executivo continua montado no Rascunho", () => {
  it("as três colunas e as proporções sobreviveram", () => {
    const s = rascunho();
    expect(s).toContain("<ResumoCurto");
    expect(s).toContain("<Resultados");
    expect(s).toContain("<GraficoDeEvolucao");
    expect(s).toContain("0.92fr");
    expect(s).toContain("1.55fr");
  });

  /**
   * O erro que a duplicação da fiação poderia reintroduzir: agrupar por `dia`
   * (o da COLETA) em vez de `publicadoEm` fazia toda conta exibir 25
   * publicações diárias — plausível, estável e errado.
   */
  it("ativações continuam por dia de PUBLICAÇÃO", () => {
    const s = rascunho();
    expect(s).toContain("m.publicadoEm");
    expect(s).not.toMatch(/porDia\.set\(m\.dia/);
  });

  /**
   * O bloqueio é da ROTA, e não da navegação.
   *
   * Sumir o link esconderia a porta sem trancá-la, e `/rascunho` é adivinhável.
   * A allowlist é escrita por extenso (`canManageContent` = admin ou dev) — a
   * forma negativa `role !== "user"` incluiria sozinha qualquer papel novo.
   */
  it("a bancada é restrita a admin e dev, na própria rota", () => {
    const s = fonte("../../pages/Rascunho.tsx");
    expect(s).toContain("canManageContent(");
    expect(s).toContain("<SemAcessoTracker");
    expect(s, "a checagem virou forma negativa").not.toMatch(/role\s*!==\s*"user"/);
  });

  /** E o item da sidebar não pode ser `livre`: livre fura o cadeado do grupo. */
  it("o item da sidebar respeita o cadeado do grupo restrito", () => {
    const s = fonte("../../pages/hub/HubSidebar.tsx");
    expect(s).toMatch(/label: "Rascunho"[^}]*href: "\/rascunho"/);
    expect(s, "o Rascunho voltou a ser livre no grupo restrito")
      .not.toMatch(/label: "Rascunho"[^}]*livre: true/);
  });

  /** A peça lê dado real: um rascunho com número fictício não ensina nada. */
  it("nenhum número fabricado na bancada", () => {
    const s = fonte("../../pages/Rascunho.tsx");
    expect(s).toContain("trpc.social.painel.useQuery");
    expect(s).not.toMatch(/mock|fake|exemplo|lorem/i);
  });
});

describe("o cabeçalho fala a língua do dashboard", () => {
  /**
   * A frase curta é o ponto do redesenho. Se o título voltar a enumerar as
   * métricas, a caixa volta a ser a tabela escrita por extenso — com a tabela
   * de verdade na coluna ao lado.
   */
  it("o resumo mostra veredito e indicadores, não a enumeração", () => {
    const s = cabecalho();
    expect(s).toContain("resumoExecutivo");
    expect(s).toContain("r.titulo");
    // Os indicadores por achado, um por métrica.
    expect(s).toContain("leitura.achados.map");
    // E o texto longo do módulo NÃO é mais renderizado aqui.
    expect(s, "a frase enumerada voltou ao cabeçalho").not.toContain("leitura.texto");
  });

  /**
   * Duas semânticas de cor, dois lugares. O ponto carrega a família; o número
   * carrega a direção. Se a família pintasse o número, o leitor teria de
   * perguntar se roxo é bom.
   */
  it("família colore o ponto e direção colore o número", () => {
    const s = cabecalho();
    for (const familia of ["COR.seguidores", "COR.visitas", "COR.ativacoes", "COR.engajamento"]) {
      expect(s, familia).toContain(familia);
    }
    expect(s).toContain("TOM_DIRECAO");
    // As quatro linhas recebem a cor da família pela página.
    const pg = pagina();
    for (const familia of ["cor: COR.ativacoes", "cor: COR.engajamento", "cor: COR.visitas", "cor: COR.seguidores"]) {
      expect(pg, familia).toContain(familia);
    }
  });

  /** Sem os dois lados medidos, não há seta: ela afirmaria movimento. */
  it("a variação ontem×hoje se recusa quando falta um lado", () => {
    const s = cabecalho();
    const corpo = s.slice(s.indexOf("function direcaoEntre"));
    expect(corpo).toMatch(/valor == null[\s\S]*?return null/);
    // Zero é estabilidade MEDIDA, e não ausência.
    expect(corpo).toContain('return "estavel"');
  });

  /**
   * O gráfico do cabeçalho não pode ganhar balão flutuante: a exigência é que a
   * altura do cabeçalho não cresça, e a leitura por isso SUBSTITUI a legenda —
   * o mesmo mecanismo dos outros dois gráficos.
   */
  it("o hover da evolução escreve na legenda, e não num balão", () => {
    const s = grafico();
    expect(s).toContain("LeituraDaEvolucao");
    const corpo = s.slice(s.indexOf("export function GraficoDeEvolucao"));
    expect(corpo).toContain("leitura={ativo != null");
    expect(corpo).toContain("onMouseEnter={() => setAtivo(i)}");
    // Nenhum posicionamento absoluto — é isso que mexeria no fluxo.
    expect(corpo).not.toContain("absolute");
  });
});

describe("o ranking mostra as duas pontas sem repetir publicação", () => {
  /**
   * Com quatro publicações, três melhores e três piores repetiriam duas — e a
   * mesma publicação apareceria como melhor e como pior na mesma tela.
   */
  it("piores só existe com amostra suficiente", () => {
    const s = pagina();
    expect(s).toContain("comTaxa.length >= 4");
    expect(s).toContain("Math.floor(comTaxa.length / 2)");
  });

  it("a seção recebe as duas listas", () => {
    expect(pagina()).toContain("piores={piores}");
  });
});
