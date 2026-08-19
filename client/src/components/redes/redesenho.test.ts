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

/**
 * Só o corpo da aba Conteúdo — já sem comentários, porque `fonte` os retira.
 *
 * O recorte importa: sem ele, "não contém `midiasSalvas`" passaria a valer para
 * a página inteira, onde a lista completa é legítima e usada pelo Resumo.
 */
const abaConteudo = () => {
  const s = pagina();
  return s.slice(s.indexOf('aba === "conteudo" && ('));
};
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
  it("toda métrica da faixa abre detalhamento complementar", () => {
    const s = pagina();
    for (const r of ["Ativações", "Engajamento", "Visitas ao perfil", "Cliques no link"]) {
      expect(s, r).toMatch(new RegExp(`<PainelDaMetrica[^>]*rotulo="${r}"`));
    }
    // Cliques continua sem cartão próprio: é o menor número da faixa.
    expect(s).not.toMatch(/<CartaoGeral[^>]*rotulo="Cliques no link"/);
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   *  A separação que o cartão passou a fazer
   * ───────────────────────────────────────────────────────────────────────────
   *    o NÚMERO responde "quanto tivemos neste período"   → segue o filtro
   *    a LINHA  responde "como isso vem evoluindo"        → ignora o filtro
   *
   *  Com "Hoje" selecionado, uma linha de um ponto não é tendência: é o mesmo
   *  número, desenhado. O jeito de isso regredir é alguém "corrigir" a linha
   *  para respeitar o filtro, achando que era inconsistência.
   * ───────────────────────────────────────────────────────────────────────────
   */
  it("a mini-linha lê o histórico, e o número lê o filtro", () => {
    const s = pagina();
    // `janelaFixa` são as últimas 30 coletas, SEM filtro; `serie` segue o filtro.
    expect(s).toMatch(/const historicoDe[\s\S]{0,200}janelaFixa\.map/);
    expect(s, "a linha voltou a seguir o filtro").not.toMatch(/const historicoDe[\s\S]{0,200}serie\.map/);
    for (const m of ["ativacoesHistorico", "engajamentoPorDia", "visitasPorDia", "cliquesPorDia"]) {
      expect(s, m).toMatch(new RegExp(`<MiniEvolucao[^>]*dias=\\{${m}\\}`));
    }
  });

  /**
   * O painel deixou de ampliar o mesmo gráfico. Se a linha voltar para dentro
   * dele, o clique passa a cobrar por não acrescentar nada — e as duas linhas
   * teriam recortes diferentes da mesma métrica.
   */
  it("o painel não repete a linha que já está no cartão", () => {
    const s = fonte("./PainelDaMetrica.tsx");
    expect(s, "a mini-série voltou ao painel").not.toContain("<MiniSerie");
    // O que sobrou é o que o cartão não cabe.
    expect(s).toContain("Período anterior");
    expect(s).toContain("procedencia");
  });

  /** A série do engajamento é o TOTAL, igual ao número grande do cartão. */
  it("a linha do engajamento segue o número, e não a taxa", () => {
    const s = pagina();
    expect(s).toContain('const engajamentoPorDia = historicoDe("total_interactions")');
    expect(s).not.toMatch(/<MiniEvolucao[^>]*dias=\{taxa/);
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
    const corpo = s.slice(s.indexOf("export function CurvaHistorica"),
      s.indexOf("export function MiniEvolucao"));
    expect(corpo).toContain("const min = Math.min(...totais)");
    expect(corpo).toContain("const max = Math.max(...totais)");
    expect(corpo, "o eixo voltou a ser ancorado no zero").not.toMatch(/piso\s*=\s*0\b/);
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   *  Um desenho só, dois tamanhos
   * ───────────────────────────────────────────────────────────────────────────
   *  O mini gráfico do cartão e a Evolução da Base são a MESMA `CurvaHistorica`.
   *  Duas implementações da mesma curva divergem no primeiro ajuste que alguém
   *  faz só numa delas — e foi exatamente assim que o sparkline decorativo
   *  apareceu.
   * ───────────────────────────────────────────────────────────────────────────
   */
  it("cartão e evolução da base desenham a mesma curva", () => {
    const s = grafico();
    for (const dono of ["MiniEvolucao", "GraficoDaEvolucaoDaBase"]) {
      const de = s.indexOf(`export function ${dono}`);
      const proximo = s.indexOf("export function ", de + 20);
      expect(s.slice(de, proximo === -1 ? undefined : proximo), dono).toContain("<CurvaHistorica");
    }
    // E a linguagem que faz dela um gráfico, e não um enfeite.
    const curva = s.slice(s.indexOf("export function CurvaHistorica"),
      s.indexOf("export function MiniEvolucao"));
    expect(curva, "a área suave sumiu").toContain("linearGradient");
    expect(curva, "o eixo de datas sumiu").toContain("intervaloDeRotulos(");
    expect(curva, "a linha voltou a ser fina").toContain("strokeWidth={2.2}");
    expect(curva, "o vão sem coleta deixou de ser tracejado").toContain('strokeDasharray={d.vao ? "3 3"');
  });

  /** Dois gradientes com o mesmo id colidiriam entre cartões. */
  it("cada curva recebe um id próprio", () => {
    const pg = pagina();
    const ids = Array.from(pg.matchAll(/<MiniEvolucao id="([^"]+)"/g)).map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ids).size, "dois cartões compartilham o id do gradiente").toBe(ids.length);
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
    expect(home).not.toContain("<PerformancePorPosicionamento");
    expect(home).not.toContain("<DetalhamentoDeReels");
    expect(home).not.toContain("<AtivacoesDoPeriodo");
  });

  it("Conteúdo responde 'qual conteúdo explica' — e recebe os quatro blocos", () => {
    const conteudo = abaConteudo();
    for (const bloco of [
      "<AtivacoesDoPeriodo", "<MelhoresEPiores",
      "<PerformancePorPosicionamento", "<RetencaoReels", "<DetalhamentoDeReels",
    ]) {
      expect(conteudo, bloco).toContain(bloco);
    }
  });

  /**
   * ── A ORDEM é a decisão, e não um detalhe de montagem ────────────────────
   * Panorama do que foi produzido → o que funcionou → qual formato funciona →
   * como os Reels seguram → o que houve em cada Reel. Cada passo é mais estreito
   * que o anterior.
   *
   * Ela já foi outra: retenção abria a aba, e o detalhe de UM formato ficava
   * acima do panorama de todos. Reordenar é uma linha de JSX movida, e nada no
   * compilador nota — por isso a ordem é verificada aqui.
   */
  it("os quatro blocos vêm na ordem definida, do panorama ao detalhe", () => {
    const conteudo = abaConteudo();
    const ordem = [
      "<AtivacoesDoPeriodo", "<PerformancePorPosicionamento",
      "<RetencaoReels", "<DetalhamentoDeReels",
    ].map((b) => conteudo.indexOf(b));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });

  /** Ativações e o ranking dividem a MESMA faixa — meia largura cada. */
  it("Ativações e Melhores → piores abrem a aba na mesma faixa", () => {
    const conteudo = abaConteudo();
    const faixa = conteudo.slice(0, conteudo.indexOf("<PerformancePorPosicionamento"));
    expect(faixa).toContain("<AtivacoesDoPeriodo");
    expect(faixa).toContain("<MelhoresEPiores");
    expect(faixa).toContain("lg:grid-cols-2");
  });

  /**
   * As duas seções de Reels leem a MESMA lista.
   *
   * Se cada uma filtrasse por conta própria, bastaria um ajuste num dos filtros
   * para a página afirmar "4 Reels" em cima e listar 5 embaixo — e nada
   * quebraria, só discordaria.
   */
  it("retenção e detalhamento saem da mesma lista de Reels", () => {
    const conteudo = abaConteudo();
    expect(conteudo).toContain("<RetencaoReels houveColeta={serie.length > 0} reels={reelsDoPeriodo");
    expect(conteudo).toContain("<DetalhamentoDeReels reels={reelsDoPeriodo");
  });

  /**
   * O filtro de período vale para as seções de Reels também.
   *
   * A retenção lia `midiasSalvas` — a lista inteira, sem recorte —, então
   * escolher "7 dias" não mudava nada nela. `reelsDoPeriodo` deriva de
   * `noPeriodo`, que já recorta por `publicadoEm`.
   */
  it("os Reels das duas seções respeitam o período selecionado", () => {
    const decl = pagina().slice(pagina().indexOf("const reelsDoPeriodo"));
    expect(decl.slice(0, 200)).toContain("noPeriodo.filter");
    // A lista sem recorte não pode voltar a alimentar nenhuma das duas.
    expect(abaConteudo()).not.toContain("midiasSalvas");
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

  /**
   * O Rascunho NÃO fica na sidebar.
   *
   * Ele é bancada de peças fora de produção, e a navegação do Spaces é do
   * produto. Misturar as duas faz a bancada parecer parte do produto — e um
   * colaborador que vê o item conclui que aquilo é uma tela oficial. O acesso
   * continua existindo pela rota e pelo atalho em Configurações.
   */
  it("o Rascunho não aparece na navegação principal", () => {
    const s = fonte("../../pages/hub/HubSidebar.tsx");
    expect(s, "o Rascunho voltou para a sidebar").not.toContain('label: "Rascunho"');
    // E continua alcançável pelo atalho de Configurações, que é admin/dev.
    expect(fonte("../../pages/hub/HubSettings.tsx")).toContain("/rascunho");
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O gatilho do detalhamento é o SELO DE VARIAÇÃO
 * ─────────────────────────────────────────────────────────────────────────────
 *  O convite "o que compõe →" gastava uma linha no fim de todo cartão para
 *  anunciar em texto o que a interação já faz, e ficava longe do número: ninguém
 *  mira o rodapé antes de decidir investigar.
 *
 *  Nada disso é visível ao compilador. Um `acao="o que compõe"` reintroduzido
 *  num cartão compila, renderiza e devolve em silêncio a redundância que esta
 *  rodada tirou.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("a variação é o que abre o detalhamento", () => {
  const cartao = () => fonte("./CartaoGeral.tsx");
  const painel = () => fonte("./PainelDaMetrica.tsx");

  it("o convite de rodapé não voltou a existir", () => {
    expect(cartao()).not.toContain("o que compõe");
    expect(pagina()).not.toContain("o que compõe");
    // `acao` era a prop que o desenhava; sem ela não há como reintroduzi-lo
    // sem passar por aqui. A borda à esquerda é obrigatória: sem ela o padrão
    // casa dentro de `explicacao?:` e `variacaoPct`, e o teste falha sozinho.
    expect(cartao()).not.toMatch(/\bacao\?:/);
  });

  it("todo painel de métrica é aberto pelo selo, e não pelo cartão", () => {
    const s = pagina();
    // Quatro métricas na faixa de dados gerais, quatro painéis pelo selo.
    expect(s.match(/envolverSelo=\{/g)?.length).toBe(4);
    // O botão que cobria o cartão inteiro (`w-full h-full`) sumiu junto: ele
    // fazia a área clicável ser o cartão, que é justamente o que mudou.
    expect(s).not.toContain("flex w-full h-full text-left");
  });

  it("o gatilho é montado no painel, e não em cada chamada", () => {
    // Quem chama passa o selo cru. O `<button>` que o Radix exige nasce num
    // lugar só — quatro chances de esquecê-lo dariam um painel que não abre, e
    // o sintoma é mudo.
    expect(painel()).toContain("<button type=\"button\"");
    expect(painel()).toContain("HoverCardTrigger asChild");
  });

  it("abre por hover, e continua alcançável por clique e teclado", () => {
    const s = painel();
    expect(s).toContain("openDelay");
    expect(s).toContain("closeDelay");
    // O gatilho é `<button>`: onde não há hover — toque, teclado — o mesmo
    // painel continua acessível.
    expect(s).toContain("focus-visible:ring");
  });

  /**
   * Uma métrica sem período anterior perderia o único caminho para o painel.
   *
   * `pct == null` não pode virar "0%" — isso afirmaria estabilidade sobre dias
   * que ninguém mediu. Mas se o selo sumir, a métrica com MENOS histórico vira
   * a única impossível de investigar, que é o contrário do necessário.
   */
  it("sem comparação, o selo fica neutro em vez de desaparecer", () => {
    const s = cartao();
    const selo = s.slice(s.indexOf("function Selo("), s.indexOf("export function CartaoGeral"));
    expect(selo).toContain("if (pct == null)");
    // Devolver null aqui apagaria o gatilho junto com o número.
    expect(selo).not.toContain("if (pct == null) return null");
    expect(selo).toContain("Sem período anterior comparável");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Uma gramática de leitura para todos os gráficos
 * ─────────────────────────────────────────────────────────────────────────────
 *  Data em tom de texto, valor na cor da série. O cinza claro é o tom da
 *  informação de apoio, e usá-lo na linha inteira apagava justamente o número
 *  que o mouse foi buscar — pior com duas séries, onde sem cor descobrir qual
 *  valor é de qual curva exige contar a ordem.
 *
 *  O risco real é a divergência: quatro gráficos escrevendo a mesma linha de
 *  quatro jeitos, e o primeiro ajuste feito num deles passa despercebido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("todos os gráficos leem um ponto do mesmo jeito", () => {
  const graficos = () => fonte("./GraficosSociais.tsx");

  it("existe um componente único de leitura, e ele é exportado", () => {
    expect(graficos()).toContain("export function LeituraDoPonto(");
  });

  it("as quatro leituras passam por ele", () => {
    // Evolução da base, evolução geral, ativações e a mini-curva dos cartões.
    expect(graficos().match(/<LeituraDoPonto/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("a data herda o tom de texto, e o valor recebe a cor da série", () => {
    const s = graficos();
    const corpo = s.slice(s.indexOf("export function LeituraDoPonto("));
    // Até a PRÓXIMA declaração, e não até o primeiro `\n}` — esse fecha o tipo
    // das props, umas dez linhas antes do corpo que interessa.
    const fim = corpo.indexOf("\nfunction ");
    const leitura = corpo.slice(0, fim > 0 ? fim : corpo.length);
    expect(leitura).toContain("return (");
    expect(leitura).toContain("font-bold");
    expect(leitura).toContain("style={{ color: v.cor }}");
    // Fixar "preto" sumiria no modo escuro; a data não recebe cor nenhuma.
    expect(leitura).not.toContain("text-black");
    // E a linha inteira não pode voltar a ser cinza de apoio.
    expect(leitura).not.toContain("text-muted-foreground");
  });

  it("a mini-curva do cartão usa a mesma gramática sob o mouse", () => {
    const s = graficos();
    const mini = s.slice(s.indexOf("export function MiniEvolucao("));
    const comMouse = mini.slice(0, mini.indexOf("evolução ·"));
    expect(comMouse).toContain("<LeituraDoPonto miuda");
    expect(comMouse).toContain("cor");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A rosca de Ativações conta pela fonte certa
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ela mistura duas origens de propósito, e a que engana é a de stories: contar
 *  story pela LISTA de mídias devolveria quase sempre zero, porque story
 *  expirado já não está nela. Um zero plausível, estável e errado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("a rosca de Ativações não inventa classificação nem contagem", () => {
  it("sai do mesmo contarAtivacoes do cartão do Resumo", () => {
    // Duas contagens paralelas discordariam no primeiro ajuste feito só numa
    // delas — e a mesma conta publicaria 24 vezes numa aba e 22 na outra.
    expect(pagina()).toContain("composicaoDetalhada(ativacoes)");
  });

  it("respeita o filtro de período, e não uma janela própria", () => {
    const s = pagina();
    expect(s).toContain("rotuloDoPeriodo={rotuloDoPeriodo}");
    expect(s).toContain("getPeriodLabel(period)");
  });

  it("as cores das fatias saem da paleta de conteúdo", () => {
    const donut = fonte("./AtivacoesDoPeriodo.tsx");
    expect(donut).toContain('from "@shared/coresSociais"');
    expect(donut).toContain("COR_TIPO[");
    // Nenhum hexadecimal solto: cor escolhida no componente vira a quinta
    // família de uma paleta que tem quatro.
    expect(donut).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O selo de variação existe, e ausência não se disfarça de zero
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dois erros diferentes moram aqui, e os dois já aconteceram:
 *
 *    1. A comparação lia uma série de 30 dias. Com "Últimos 30d" selecionado, o
 *       período anterior caía inteiro fora do recorte e as QUATRO métricas
 *       perdiam o selo ao mesmo tempo — sem erro, sem log, só um canto vazio
 *       que parecia problema de dado do cliente.
 *
 *    2. O estado "sem comparação" usava o mesmo ícone do estado "estável". Um
 *       é fato sobre a conta ("não mudou"), o outro é limite nosso ("não dá
 *       para saber"), e um selo cinza com traço se lê como o primeiro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("o selo de variação alcança o período anterior", () => {
  const cartao = () => fonte("./CartaoGeral.tsx");

  it("a comparação lê a série longa, e não a dos gráficos", () => {
    const s = pagina();
    const corpo = s.slice(s.indexOf("const variacaoDe ="), s.indexOf("const met2 ="));
    expect(corpo).toContain("serieLonga.map");
    // `janelaFixa` é a série de 30 dias que desenha os gráficos. Ela não
    // alcança o período anterior de um filtro de 30 dias.
    expect(corpo).not.toContain("janelaFixa");
  });

  it("Ativações compara pela mesma série longa que as outras três", () => {
    const s = pagina();
    const corpo = s.slice(s.indexOf("const varAtivacoes"), s.indexOf("const porTipo"));
    expect(corpo).toContain("serieLonga.map");
    expect(corpo).not.toContain("janelaFixa");
  });

  /**
   * Stories entram na contagem de ativações. Se eles viessem da série curta e
   * os posts da longa, o período anterior teria os posts e não os stories — e o
   * selo mediria a mudança de ALCANCE DA SÉRIE, não a de produção.
   */
  it("stories da composição diária vêm da mesma série longa", () => {
    const s = pagina();
    const corpo = s.slice(s.indexOf("const composicaoPorDia"), s.indexOf("const ativacoesRecentesPorDia"));
    expect(corpo).toContain("serieParaVariacao");
    expect(corpo).not.toContain("statusDaConta");
  });

  it("a série longa não substituiu a dos gráficos", () => {
    // `statusDaConta` continua alimentando os gráficos com a janela de sempre.
    // Alargá-la seria mexer no período máximo deles, que é outra decisão.
    const s = pagina();
    expect(s).toContain("d?.historico.statusDaConta ?? []");
    expect(s).toContain("d?.historico.serieParaVariacao ?? []");
  });

  it("o servidor manda as duas séries, e a longa não custa consulta nova", () => {
    const r = fonte("../../../../server/routers.ts");
    expect(r).toContain("const serieParaVariacao = todos.slice(-70)");
    expect(r).toContain("const statusDaConta = todos.slice(-30)");
    // `todos` já está em memória — a série longa é projeção, não busca.
    const trecho = r.slice(r.indexOf("const serieParaVariacao"), r.indexOf("const midiasRecentes"));
    expect(trecho).not.toContain("await");
  });
});

describe("sem comparação não pode parecer estabilidade", () => {
  const cartao = () => fonte("./CartaoGeral.tsx");
  const selo = () => {
    const s = cartao();
    return s.slice(s.indexOf("function Selo("), s.indexOf("export function CartaoGeral"));
  };

  it("o estado estável mostra o número medido, com ícone", () => {
    const s = selo();
    // `0,0%` é um FATO sobre a conta, e some se o selo virar traço.
    expect(s).toContain("plano");
    expect(s).toContain("pct.toFixed(1)");
    expect(s).toContain("Minus");
  });

  it("o estado sem comparação não usa o ícone do estável", () => {
    const s = selo();
    const ausencia = s.slice(s.indexOf("if (pct == null)"), s.indexOf("const plano"));
    expect(ausencia).not.toContain("Minus");
    expect(ausencia).not.toContain("bg-muted");
    // Contorno tracejado: a gramática que a página usa para "falta dado".
    expect(ausencia).toContain("border-dashed");
    expect(ausencia).toContain("não é calculável");
  });

  it("as três direções continuam com cor e seta próprias", () => {
    const s = selo();
    expect(s).toContain("ArrowUpRight");
    expect(s).toContain("ArrowDownRight");
    expect(s).toContain("emerald");
    expect(s).toContain("destructive");
    // A direção boa é declarada, e não deduzida do sinal: uma métrica de custo
    // que entrasse aqui apareceria em verde por ter subido.
    expect(s).toContain('bom === "sobe"');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O painel não repete o que o cartão já mostra
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ele existe para o que NÃO cabe no cartão: período anterior, proporção da
 *  base, procedência. Um gráfico que o usuário está olhando enquanto passa o
 *  mouse não é isso — é a mesma resposta duas vezes, e a segunda cobrando um
 *  gesto.
 *
 *  A regressão é fácil e silenciosa: basta alguém achar que "o painel está
 *  vazio demais" e repor ali o gráfico grande.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("o painel de hover complementa o cartão, sem duplicá-lo", () => {
  it("nenhum gráfico de ativações vive dentro do painel", () => {
    const s = pagina();
    // Até o FECHAMENTO do painel, e não até o próximo painel: o gráfico do
    // cartão fica entre os dois, e um corte largo o pegaria junto.
    const abre = s.indexOf('<PainelDaMetrica rotulo="Ativações"');
    const painelAtivacoes = s.slice(abre, s.indexOf("</PainelDaMetrica>", abre));
    expect(painelAtivacoes).not.toContain("<GraficoDeAtivacoes");
  });

  it("o slot genérico que hospedava o gráfico deixou de existir", () => {
    // Sem `extra`, não há onde repor um gráfico redundante sem passar por aqui.
    const painel = fonte("./PainelDaMetrica.tsx");
    expect(painel).not.toContain("extra?:");
    expect(painel).not.toContain("{extra}");
  });

  it("o gráfico continua no cartão, que é onde ele responde", () => {
    // Removê-lo do painel não pode ter levado o do cartão junto.
    expect(pagina()).toMatch(/grafico=\{<GraficoDeAtivacoes[^>]*compacto/);
  });

  it("o painel mantém o que ele sozinho responde", () => {
    const painel = fonte("./PainelDaMetrica.tsx");
    for (const parte of ["Período anterior", "Da base", "dia(s) medido(s)", "{procedencia}"]) {
      expect(painel, parte).toContain(parte);
    }
  });
});
