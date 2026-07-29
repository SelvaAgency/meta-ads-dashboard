import { describe, it, expect } from "vitest";
import { parseNubankCsv, parseValorBR } from "./parseNubank";
import { classificarLinha, conciliarFatura, DICIONARIO_SEED } from "./classificador";

/**
 * Fixture SINTÉTICO (o repo é público — a fatura real do Gui nunca é versionada).
 * Reproduz o formato Nubank e todos os casos-limite: IOF/IOF-de-volta, exclusões,
 * Apple ambíguo por valor, estabelecimento novo (revisar), competência por data.
 */
const CSV = `date,title,amount
2026-07-03,"Dm *Mailchimp","100,00"
2026-06-21,"Dm *Mailchimp","94,00"
2026-06-29,"Mgf* Magnific Premium","99,20"
2026-06-29,"IOF de ""Mgf* Magnific Premium""","3,47"
2026-06-29,"IOF de volta de Mgf* Magnific Premium","- 3,47"
2026-06-24,Wix*1247144093,"1.344,00"
2026-06-13,Facebk* Pkl7ztran2,"1.086,11"
2026-06-17,Apple.Com/Bill,"120,90"
2026-06-17,Apple.Com/Bill,"19,90"
2026-06-16,Ppro*Linkedin,"139,99"
2026-06-11,Pagamento recebido,"- 13.650,93"
2026-06-13,"Estorno de ""Google One"" (Google One)","- 6,33"
2026-06-12,Ajuste a crÃ©dito,"- 3,68"
2026-07-04,Dl*99 Ride,"11,30"
2026-06-21,Ifd*Nosh Stfood Sp Del,"72,48"`;

describe("valor pt-BR → centavos", () => {
  it("milhar, decimal e negativo", () => {
    expect(parseValorBR("1.086,11")).toBe(108611);
    expect(parseValorBR("- 0,16")).toBe(-16);
    expect(parseValorBR("120,90")).toBe(12090);
    expect(parseValorBR("- 13.650,93")).toBe(-1365093);
    expect(parseValorBR("7,14")).toBe(714);
  });
});

describe("parser Nubank", () => {
  const linhas = parseNubankCsv(CSV);

  it("IOF: mantém 'IOF de X' (vira o estabelecimento), descarta 'IOF de volta'", () => {
    const iof = linhas.find((l) => l.descritorOriginal.startsWith("IOF de \"Mgf"));
    expect(iof?.tipo).toBe("IOF");
    expect(iof?.descritor).toBe("Mgf* Magnific Premium"); // atribuído ao estabelecimento
    const volta = linhas.find((l) => l.descritorOriginal.startsWith("IOF de volta"));
    expect(volta?.tipo).toBe("EXCLUIDO");
  });

  it("exclui pagamento, estorno e ajuste a crédito (mesmo com encoding torto)", () => {
    const excl = linhas.filter((l) => l.tipo === "EXCLUIDO").map((l) => l.motivo);
    expect(linhas.find((l) => /pagamento recebido/i.test(l.descritorOriginal))?.tipo).toBe("EXCLUIDO");
    expect(linhas.find((l) => /estorno/i.test(l.descritorOriginal))?.tipo).toBe("EXCLUIDO");
    expect(linhas.find((l) => /ajuste a cr/i.test(l.descritorOriginal))?.tipo).toBe("EXCLUIDO");
    expect(excl.length).toBeGreaterThanOrEqual(4); // + IOF de volta
  });

  it("campos entre aspas com vírgula são parseados certo", () => {
    const wix = linhas.find((l) => l.descritor.startsWith("Wix*"));
    expect(wix?.valorCents).toBe(134400);
  });
});

describe("classificação", () => {
  it("SELVA por padrão, com o porquê", () => {
    const l = classificarLinha({ data: "2026-06-21", descritorOriginal: "Dm *Mailchimp", descritor: "Dm *Mailchimp", valorCents: 9400, tipo: "COMPRA" });
    expect(l.categoria).toBe("SELVA");
    expect(l.canonical).toBe("Mailchimp SELVA");
    expect(l.confianca).toBe("alta");
  });

  it("Apple ambíguo por VALOR: 120,90 = SELVA (Instagram); 19,90 = pessoal", () => {
    const selva = classificarLinha({ data: "x", descritorOriginal: "Apple.Com/Bill", descritor: "Apple.Com/Bill", valorCents: 12090, tipo: "COMPRA" });
    const pess = classificarLinha({ data: "x", descritorOriginal: "Apple.Com/Bill", descritor: "Apple.Com/Bill", valorCents: 1990, tipo: "COMPRA" });
    expect(selva.categoria).toBe("SELVA");
    expect(selva.canonical).toBe("Apple (Verificado Instagram)");
    expect(pess.categoria).toBe("PESSOAL");
  });

  it("estabelecimento novo (LinkedIn) vira REVISAR — nunca chuta", () => {
    const l = classificarLinha({ data: "x", descritorOriginal: "Ppro*Linkedin", descritor: "Ppro*Linkedin", valorCents: 13999, tipo: "COMPRA" });
    expect(l.categoria).toBe("REVISAR");
  });

  it("delivery/transporte são pessoais (tiram ruído)", () => {
    expect(classificarLinha({ data: "x", descritorOriginal: "Ifd*Nosh", descritor: "Ifd*Nosh", valorCents: 7248, tipo: "COMPRA" }).categoria).toBe("PESSOAL");
    expect(classificarLinha({ data: "x", descritorOriginal: "Dl*99 Ride", descritor: "Dl*99 Ride", valorCents: 1130, tipo: "COMPRA" }).categoria).toBe("PESSOAL");
  });
});

describe("conciliação por competência (data da transação)", () => {
  const linhas = parseNubankCsv(CSV);

  it("junho: Magnific soma IOF (99,20+3,47=102,67) e descarta o de volta", () => {
    const c = conciliarFatura(linhas, "2026-06");
    const mag = c.selva.find((s) => s.canonical === "Freepik / Magnific");
    expect(mag?.valorCents).toBe(10267);
  });

  it("junho: Mailchimp = só a linha de junho (94,00); a de julho fica fora", () => {
    const c = conciliarFatura(linhas, "2026-06");
    expect(c.selva.find((s) => s.canonical === "Mailchimp SELVA")?.valorCents).toBe(9400);
    // a compra de 2026-07-03 não entra em junho
    expect(c.foraDoMes.find((l) => l.descritor.startsWith("Dm *Mailchimp"))).toBeTruthy();
  });

  it("julho: Mailchimp = a linha de julho (100,00); 99 Ride é pessoal", () => {
    const c = conciliarFatura(linhas, "2026-07");
    expect(c.selva.find((s) => s.canonical === "Mailchimp SELVA")?.valorCents).toBe(10000);
    expect(c.pessoal.find((l) => l.descritor.startsWith("Dl*99 Ride"))).toBeTruthy();
  });

  it("junho: Ads (Facebk) e Wix entram; Apple 120,90 SELVA e 19,90 pessoal", () => {
    const c = conciliarFatura(linhas, "2026-06");
    expect(c.selva.find((s) => s.canonical === "Ads SELVA")?.valorCents).toBe(108611);
    expect(c.selva.find((s) => s.canonical === "Wix")?.valorCents).toBe(134400);
    expect(c.selva.find((s) => s.canonical === "Apple (Verificado Instagram)")?.valorCents).toBe(12090);
    expect(c.pessoal.find((l) => l.descritor === "Apple.Com/Bill" && l.valorCents === 1990)).toBeTruthy();
  });

  it("exclusões (pagamento/estorno/ajuste/IOF de volta) ficam fora do total SELVA", () => {
    const c = conciliarFatura(linhas, "2026-06");
    expect(c.ignorados.length).toBeGreaterThanOrEqual(4);
    // total SELVA de junho = Ads + Wix + Magnific + Mailchimp(jun) + Apple120,90
    expect(c.totalSelvaCents).toBe(108611 + 134400 + 10267 + 9400 + 12090);
  });

  it("LinkedIn cai em REVISAR na conciliação", () => {
    const c = conciliarFatura(linhas, "2026-06");
    expect(c.revisar.find((l) => /linkedin/i.test(l.descritor))).toBeTruthy();
  });
});

describe("dicionário-semente", () => {
  it("cobre os principais estabelecimentos SELVA da planilha", () => {
    const canons = new Set(DICIONARIO_SEED.filter((r) => r.categoria === "SELVA").map((r) => r.canonical));
    for (const nome of ["Ads SELVA", "Claude AI", "Open IA", "Mailchimp SELVA", "Mlabs", "Freepik / Magnific", "Wix", "Trello", "Figma", "Manus AI", "Render"]) {
      expect(canons.has(nome)).toBe(true);
    }
  });
});
