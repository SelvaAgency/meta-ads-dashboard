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
    expect(s.slice(b), "o gráfico saiu da região do movimento").toContain("<GraficoDeMovimento");
  });

  /**
   * O SVG escala uniformemente, então um viewBox de 760 numa coluna de 376px
   * reduz o rótulo do eixo de 9px para ~4,5px. Compactar sem passar `largura`
   * seria trocar espaço por ilegibilidade — o oposto do que se pediu.
   */
  it("o movimento compacto encolhe o viewBox, não só a coluna", () => {
    expect(pagina()).toMatch(/<GraficoDeMovimento[^>]*largura=\{\d+\}/);
  });

  /**
   * Cliques no link é o menor número da faixa. Um cartão permanente lhe daria a
   * mesma área do engajamento — a leitura profunda abre a partir do dado.
   */
  it("cliques no link abre painel, e não ganha cartão", () => {
    const s = pagina();
    expect(s).toContain("<PainelDeCliques");
    expect(s).not.toMatch(/<CartaoGeral[^>]*rotulo="Cliques no link"/);
    // A série do painel guarda `null` no dia sem medição: interpolar desenharia
    // uma inclinação que ninguém mediu.
    expect(s).toContain('cliques: mets(p, "website_clicks")');
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

  /** Views entrou no card de publicação — o snapshot já tinha o campo. */
  it("a publicação mostra views além de alcance, interações e taxa", () => {
    const s = conteudo();
    for (const r of ["alcance", "interações", "taxa", "views"]) {
      expect(s).toContain(`rotulo="${r}"`);
    }
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
    expect(s).toContain("strokeWidth={2.2}");
    expect(s).toContain('strokeDasharray="3 4"');
    // As larguras de barra saem do PASSO horizontal, e não de um número fixo:
    // com 30 dias, uma largura fixa faria as barras se encavalarem.
    expect(s).toMatch(/passoX \* 0\.46/);
    expect(s).toMatch(/passo \* 0\.62/);
  });

  /**
   * O eixo do movimento deixou de ser fixo a 56% da altura.
   *
   * Aquele número era do protótipo, e o protótipo tinha dados fictícios em que
   * ele funcionava. Com dados reais, um dia de +2 e −2 precisa do zero no MEIO,
   * e um período sem nenhuma saída precisa do zero na base — senão metade do
   * painel fica reservada para um lado vazio e as barras que existem aparecem
   * pela metade da altura.
   */
  it("o zero do movimento vem do DADO, não de uma fração fixa", () => {
    const s = grafico();
    expect(s).toContain("escalaDoMovimento");
    expect(s).toContain("fracaoDoZero");
    expect(s, "voltou a fixar o eixo a 56%").not.toMatch(/ih \* 0\.56/);
  });

  /**
   * A linha roxa desenha o SALDO — a variação medida. Plotar o estoque de
   * seguidores foi o erro que fazia +2 entradas e −2 saídas parecerem
   * crescimento, com a legenda dizendo "Saldo" o tempo todo.
   */
  it("a linha de saldo não plota o estoque de seguidores", () => {
    const s = grafico();
    expect(s).toContain("p.saldo");
    expect(s, "voltou a plotar o total").not.toMatch(/yS\(p\.total\)/);
    // E a área preenchida saiu: ela era ruído justamente no saldo zero.
    expect(s).not.toContain("grSaldo");
  });

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
