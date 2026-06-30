import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileSignature,
  Upload,
  Loader2,
  Download,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

const MESES = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

interface ContractForm {
  razaoSocial: string;
  tipo: string;
  cnpj: string;
  enderecosede: string;
  nomeRepresentante: string;
  genero: string;
  estadoCivil: string;
  rg: string;
  rgOrgao: string;
  cpf: string;
  enderecoResidencial: string;
  objeto: string;
  valor: string;
  clausulaRevisao: boolean;
  valorRevisao: string;
  data: string;
}

function todayLocal(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

const DEFAULT_FORM: ContractForm = {
  razaoSocial: "",
  tipo: "MEI",
  cnpj: "",
  enderecosede: "",
  nomeRepresentante: "",
  genero: "F",
  estadoCivil: "",
  rg: "",
  rgOrgao: "",
  cpf: "",
  enderecoResidencial: "",
  objeto: "",
  valor: "",
  clausulaRevisao: false,
  valorRevisao: "",
  data: todayLocal(),
};

function fmtData(s: string): string {
  if (!s) return "";
  const parts = s.split("-");
  const y = parts[0] ?? "";
  const m = parts[1] ?? "";
  const d = parts[2] ?? "";
  return parseInt(d) + " de " + (MESES[parseInt(m) - 1] ?? "") + " de " + y;
}

function g(genero: string, f: string, m: string): string {
  return genero === "F" ? f : m;
}
function generateContractHTML(form: ContractForm): string {
  const gn = form.genero;
  const tipoDesc =
    form.tipo === "MEI"
      ? "MEI"
      : form.tipo === "EI"
      ? "empresária individual"
      : form.tipo;
  const reprVerb = g(gn, "representada", "representado");
  const reprPron = g(
    gn,
    "por sua administradora, Sra.",
    "pelo seu administrador, Sr."
  );
  const nation = g(gn, "brasileira", "brasileiro");
  const portador = g(gn, "portadora", "portador");
  const inscrito = g(gn, "inscrita", "inscrito");
  const resDom = g(
    gn,
    "residente e domiciliada",
    "residente e domiciliado"
  );
  const empresa = g(gn, "empresária", "empresário");
  const endRes = form.enderecoResidencial || form.enderecosede;
  const dataCidade = "São Paulo, " + fmtData(form.data);

  const c21s =
    "A CONTRATANTE pagará à CONTRATADA, pela prestação dos serviços ora contratados, o valor fixo de " +
    form.valor +
    " mensais, com pagamento proporcional no primeiro mês, se aplicável, o qual será pago em até 05 (cinco) dias do mês subsequente ao da prestação dos serviços, sempre condicionado à apresentação de nota fiscal idônea e indicação de conta bancária de titularidade da CONTRATADA ou entrega de cheque nominal, mediante emissão de recibo, podendo a CONTRATANTE reter os pagamentos devidos até a apresentação pela CONTRATADA das condições previstas nesta cláusula.";

  const c21r =
    "A CONTRATANTE pagará à CONTRATADA, pela prestação dos serviços ora contratados, o valor fixo de " +
    form.valor +
    " mensais, durante 3 (três) meses, com pagamento proporcional no primeiro mês, se aplicável, o qual será pago em até 05 (cinco) dias do mês subsequente ao da prestação dos serviços, sempre condicionado à apresentação de nota fiscal idônea e indicação de conta bancária de titularidade da CONTRATADA ou entrega de cheque nominal, mediante emissão de recibo, podendo a CONTRATANTE reter os pagamentos devidos até a apresentação pela CONTRATADA das condições previstas nesta cláusula. Apó os 3 (três) meses iniciais, em caso de decisão de continuidade da relação, o valor fixo passarɾ a ser de " +
    form.valorRevisao +
    ".";

  const c21 = form.clausulaRevisao ? c21r : c21s;

  const P = (t: string) =>
    '<p style="margin:0 0 10pt;text-align:justify;">' + t + "</p>";
  const C = (t: string) =>
    '<p style="margin:14pt 0 4pt;font-weight:bold;">' + t + "</p>";
  const PI = (t: string) =>
    '<p style="margin:0 0 10pt;text-align:justify;margin-left:1.5cm;">' +
    t +
    "</p>";

  const cb =
    form.razaoSocial +
    ", " +
    tipoDesc +
    ", com sede na " +
    form.enderecosede +
    ", inscrita no CNPJ sob o n° " +
    form.cnpj +
    ", neste ato " +
    reprVerb +
    " " +
    reprPron +
    " " +
    form.nomeRepresentante +
    ", " +
    nation +
    ", " +
    form.estadoCivil +
    ", " +
    empresa +
    ", " +
    portador +
    " da cédula de identidade RG n¾ " +
    form.rg +
    ", expedida pel" +
    g(gn, "a", "o") +
    " " +
    form.rgOrgao +
    ", " +
    inscrito +
    " no CPF sob o n¶ " +
    form.cpf +
    ", " +
    resDom +
    " na " +
    endRes +
    ', doravante denominada simplesmente "CONTRATADA";';
  const parts: string[] = [
    P("Pelo presente instrumento particular e na melhor forma de direito,"),
    P("De um lado,"),
    P(
      'SELVA AGENCY LTDA., sociedade empresária limitada, com sede na Cidade de São Paulo, Estado de São Paulo, na Avenida Nove de Julho, nº 3.228, conjunto 1811, Jardim Paulista, CEP 01.406-000, inscrita no CNPJ sob o n° 45.240.503/0001-72, neste ato representada pelo seu administrador, Sr. Guilherme Teruchkin Felberg, brasileiro, solteiro, empresário, portador da cédula de identidade RG nº 36.169.549-4, expedida pela SSP/SP, inscrito no CPF sob o n¶ 424.018.358-81, residente e domiciliado na Cidade de São Paulo, Estado de São Paulo, na Rua Wanderley, nº 806, apto. 31, Perdizes, CEP 05011-001, doravante denominada simplesmente "CONTRATANTE";'
    ),
    P("E, do outro lado, "),
    P(cb),
    P('Sendo CONTRATANTE e CONTRATADA em conjunto referidas como "Partes" e individual e indistintamente como "Parte".'),
    P('RESOLVEM as Partes celebrar o presente Contrato de Prestação de Serviços ("Contrato"), firmado nos termos da Lei 6.019/74, conforme alterada pela Lei 13.429/2017, nos seguintes termos e condições:'),
    C("Cláusula Primeira - Do Objeto"),
    P("1.1. O objeto do presente Contrato é a prestação de serviços de " + form.objeto + "."),
    C("Cláusula Segunda - Do Preço"),
    P("2.1. " + c21),
    P("2.2. A CONTRATANTE, de forma a incentivar o aprimoramento da qualidade dos serviços contratados, sempre por liberalidade e de comum acordo, poderá realizar o pagamento de incentivos, bonificações, reembolsos de transporte e alimentação, e outros acréscimos, sempre mediante o recebimento de recibo e especificação de remuneração, bem como a emissão de nota fiscal de serviços pela CONTRATADA."),
    P("2.3. As partes acordam que será concedida uma interrupção remunerada da prestação de serviços com a finalidade de descanso de sua equipe ou pelo sócio designado pelo prazo contínuo de 15 (quinze) dias a cada 12 (doze) meses da presente contratação."),
    P("2.4. O valor do pagamento referido no item 2.1. poderá ser reajustado anualmente, sempre mediante a celebração de termo aditivo."),
    P("Parágrafo Primeiro - As despesas necessárias ao exercício normal da Prestação dos Serviços, objeto deste Contrato, ligadas à material de escritório correm por conta da CONTRATANTE."),
    C("Cláusula Terceira - Do Prazo"),
    P("3.1. O prazo de vigência do presente Contrato será de 3 meses, iniciando-se na data de sua assinatura, desde que não haja manifestação em contrário, por qualquer das partes, até 05 (cinco) dias antes da data do seu vencimento, após este período o Contrato se tornará por prazo indeterminado."),
    P("Parágrafo Primeiro - Mediante comunicação prévia com 15 (quinze) dias de antecedência, quaisquer das partes poderá requerer a rescisão antecipada do presente Contrato, imotivadamente, sem a aplicação de qualquer multa ou indenização, além das partes ficarem desobrigadas do cumprimento ou pagamento do aviso prévio."),
    P("Parágrafo Segundo - O presente Contrato será considerado rescindido de pleno direito, no caso de falência, concordata ou liquidação, de quaisquer das partes, não sendo aplicável nesse caso nenhuma multa ou indenização."),
    P("Parágrafo Terceiro - No caso de encerramento do presente Contrato, a CONTRATADA deverá devolver, à CONTRATANTE, todo material em seu poder e que pertença à CONTRATANTE. A CONTRATANTE deverá quitar quaisquer pagamentos devidos."),
    C("Cláusula Quarta - Da Inadimplência"),
    P("4.1 Caso quaisquer das partes torne-se inadimplente com as obrigações ora contratadas, a parte inocente notificará por escrito a parte inadimplente para que cumpra com suas obrigações ou sane eventuais irregularidades no prazo máximo e improrrogável de 5 (cinco) dias úteis, a contar da data do recebimento da notificação, sob pena da parte prejudicada considerar a rescisão motivada do presente Contrato, mediante simples aviso à parte contratada, com a aplicação de multa por inadimplemento no valor correspondente a uma remuneração."),
    C("Cláusula Quinta - Da Execução dos Serviços"),
    P("5.1 Os serviços objeto do presente Contrato serão realizados pela CONTRATADA, sob sua exclusiva responsabilidade, de forma a atender as necessidades da CONTRATANTE, em conformidade com o presente Contrato."),
    P("5.2 Os serviços serão prestados pela CONTRATADA na sede da CONTRATANTE, ou caso seja possível em razão da modalidade dos serviços contratados, de forma remota, em horário comercial, das 09:00 às 18:00."),
    P("5.2.1 Resta vedado à CONTRATADA realizar os serviços ora contratados fora do horário comercial estipulado no item 5.2 acima, ou em finais de semana, salvo prévia e expressa autorização por escrito da CONTRATANTE, quando serão ajustados os serviços e honorários não previstos neste instrumento."),
    P("5.2.2. Não haverá controles de horários de chegada ou saída ou subordinação, com total autonomia da CONTRATADA em relação à CONTRATANTE, se comprometendo a CONTRATANTE a executar os serviços contratados através das horas necessárias à execução dos serviços, conforme acordado, sob pena dos respectivos descontos. Caso não seja solicitado por escrito pela CONTRATANTE, não serão devidas horas adicionais às expressamente contratadas nesta cláusula."),
    P("5.3. A CONTRATADA declara que é habilitada para a execução dos serviços elencados no item 1.1. Os serviços ora contratados deverão corresponder aos padrões de qualidade da CONTRATANTE."),
    C("Cláusula Sexta \u2013 Da confidencialidade"),
    P("6.1. As Partes comprometem-se, mutuamente, a zelar pela manutenção do sigilo de todos os segredos comerciais, conhecimentos técnicos e outras informações que venham a tomar conhecimento uma da outra em função do relacionamento comercial de que trata o presente Contrato, não podendo usar qualquer dessas informações confidenciais, a não ser quando expressamente autorizadas para tanto por seu titular. Nesse sentido, cada Parte deverá, e para isso exercerá todos os seus poderes, fazer com que seus sócios, empresas afiliadas, administradores, prepostos, empregados e/ou quaisquer outras pessoas sob sua responsabilidade (direta ou indireta) mantenham em sigilo todos os termos e condições do presente Contrato."),
    C("Cláusula Sétima - Da propriedade Intelectual e Industrial"),
    P("7.1. As partes obrigam-se a não empreender nenhuma atividade, tampouco realizar quaisquer atos, quer seja direta ou indiretamente, que venham a afetar ou a prejudicar, de algum modo, o direito, a titularidade e o uso pela CONTRATANTE de suas marcas registradas, nomes comerciais ou qualquer direito de propriedade intelectual ou industrial, registrado ou não."),
    P("7.2. Nenhum direito de propriedade intelectual e industrial atualmente existente de propriedade da CONTRATANTE será outorgado à CONTRATADA em virtude deste Contrato."),
    P("7.3. Todos os softwares, produtos, layouts, sistemas, banco de dados, aplicações, ideias ou assemelhados elaboradas (os) pela CONTRATADA, na pessoa de seus sócios e/ou empregados, em virtude da presente contratação são cedidas à CONTRATANTE por prazo indeterminado, de forma irrevogável e irretratável. Após a rescisão deste instrumento, a CONTRATADA fica impedida de divulgar ou utilizar o material elaborado durante a presente Prestação de Serviços e cedido à CONTRATANTE, mesmo para uso próprio ou portfólio, restando vedado ainda copiar arquivos eletrônicos ou fazer backup dos arquivos eletrônicos elaborados ao longo da presente contratação, sem autorização por escrito da CONTRATANTE, sob pena de incorrer nas penalidades criminais e cíveis cabíveis previstas na legislação e uma multa correspondente ao valor do presente Contrato."),
    C("Cláusula Oitava - Responsabilidades da Contratada"),
    P("8.1. A CONTRATADA é obrigada a prestar os serviços objeto do presente instrumento, através de seus sócios, ou caso possua, através de seus recursos humanos, restando expressamente autorizada a substituição dos sócios da CONTRATADA por empregados da mesma, desde que seja observando o estrito cumprimento dos termos deste Contrato, possua as qualificações necessárias e mediante a prévia celebração de um Contrato de Confidencialidade."),
    P("Parágrafo Primeiro - Sem prejuízo das demais responsabilidades já previstas neste Contrato, serão também responsabilidades exclusivas da CONTRATADA, por sua conta e risco:"),
    PI('(a) respeitar e cumprir as determinações e instruções da CONTRATANTE, relativas à qualidade e ao bom andamento dos serviços, assim como seus empregados, representantes, contratados e/ou prepostos, bem como quanto à interrupção de qualquer trabalho que não esteja sendo executado de acordo com as especificações, observando-se desde já o dispositivo no item "b" abaixo, ou que atente contra a segurança de bens ou pessoas;'),
    PI("(b) refazer de imediato, às suas expensas, qualquer trabalho inadequadamente executado e/ou recusado pela CONTRATANTE, durante a vigência deste Contrato, sem que isso represente custo qualquer adicional;"),
    PI("(c) a CONTRATADA tem exclusiva responsabilidade por as obrigações fiscais, diretas ou indiretas, trabalhistas, previdenciárias e sociais decorrentes dos contratos de trabalho que mantém com seus empregados, ou dos contratos que mantém com seus prestadores de serviços, empregados ou não, aí incluídas as relativas aos eventuais acidentes de trabalho, devendo efetuar por sua conta e exclusiva responsabilidade o pagamento dos salários, remuneração indireta, adicionais de qualquer espécie, atualmente existentes ou que venham a ser criados."),
    PI("(d) Este Contrato não gera qualquer tipo de responsabilidade, solidária ou não, entre as partes contratantes, especialmente no que tange às obrigações trabalhistas e previdenciárias, em especial oriunda do (s) sócios que assinam o presente instrumento, entretanto, na eventualidade da CONTRATANTE vir a ser acionada ou obrigada a efetuar o pagamento de quaisquer das obrigações trabalhistas, sociais ou previdenciárias, relativas aos empregados, contratados, representantes e ou prepostos da CONTRATADA, esta última desde já obriga-se respeitar as obrigações contidas na cláusula de salvaguardas especificadas neste Contrato."),
    PI("(e) cumprir e fazer cumprir por seus representantes, empregados, contratados e prepostos a qualquer título, todas as leis, decretos, normas e regulamentos e dispositivos legais emitidos pelas autoridades governamentais, no âmbito municipal, estadual e federal, pertinentes à execução dos serviços ora contratados;"),
    PI("(f) a CONTRATADA é a única responsável pela segurança de suas operações e atividades e de seus empregados, contratados, prepostos e representantes, no que estes possam vir a ser afetados, assumindo e concordando que a observança a quaisquer determinações da CONTRATANTE, referentes a segurança, não a desobrigará de sua exclusiva responsabilidade a esse título."),
    PI("(g) a CONTRATADA reconhece que determinados instrumentos de trabalho, tais como computador, tablet, telefone celular e demais equipamentos eventualmente disponibilizados para a execução dos serviços, são de propriedade exclusiva da CONTRATANTE e lhe são cedidos apenas durante o período de vigência deste Contrato, exclusivamente para fins profissionais. A CONTRATADA obriga-se a zelar pela boa conservação e utilização adequada de tais bens, responsabilizando-se por qualquer dano, perda, extravio ou uso indevido que não decorra de desgaste natural pelo uso regular. Ao término da prestação dos serviços, ou sempre que solicitado pela CONTRATANTE, a CONTRATADA compromete-se a devolver imediatamente todos os equipamentos recebidos, em perfeitas condições de funcionamento, ressalvadas as deteriorações inerentes ao uso normal."),
    PI("(h) Sem prejuízo das disposições anteriores acima, o(s) sócio(s) que subscrevem o presente Contrato em nome da CONTRATADA declaram ter lido todas as suas responsabilidades perante este Contrato, declaram encontrar-se em pleno exercício de suas faculdades intelectuais, declaram ainda ter analisado atentamente todas as disposições contratuais e optaram livremente pela escolha da modalidade de contratação de prestação de serviços, renunciando expressamente a todo e qualquer eventual direito garantido pela consolidação das leis do trabalho, preferindo livremente exercer sob as regras deste Contrato as seguintes premissas: liberdade laboral, autonomia, sem subordinação ou horários fixos, além da liberdade de firmar contratos com outras empresas, nos termos da Lei 6.019/74, conforme alterada pela Lei 13.429/2017."),
    C("Cláusula Nona \u2013 Da salvaguarda"),
    P("9.1. Além das disposições específicas previstas neste Contrato, a CONTRATADA concede imunidade total e irrestrita à CONTRATANTE em razão de eventuais reclamações trabalhistas em face da CONTRATANTE oriundas do presente Contrato, podendo a CONTRATADA, caso deseje, constituir fundo ou seguro para se prevenir de litígios ocorridos em decorrência do presente Contrato, devendo a CONTRATADA, caso a CONTRATANTE seja acionada na Justiça do trabalho em decorrência deste Contrato, em 05 (cinco) dias corridos da notificação extrajudicial neste sentido, depositar em conta-corrente indicada pela CONTRATANTE, o valor correspondente a 10 (dez) remunerações especificadas na Cláusula 2.1. a deste Contrato, à título de adiantamento das despesas com advogados e custas processuais. A falta de depósito do valor de adiantamento referido nesta cláusula autorizará a constitução de título executivo extrajudicial em favor da CONTRATANTE no valor de 10 (dez) remunerações especificadas na Cláusula 2.1. deste Contrato, podendo este Contrato ser levado a protesto, permitindo ainda o nome da CONTRATADA e de seu representante legal serem negativados perante os órgão de proteção ao crédito, bem como este crédito ser executado judicialmente."),
    P("9.2. Nos termos da Cláusula 9.1 acima, após o trânito em julgado da ação trabalhista, se houver, a CONTRATANTE poderá cobrar imediatamente da CONTRATADA o valor da condenação trabalhista, acrescida de juros de 1% (um por cento ao mês), atualização monetária na forma da legislação vigente, bem como honorários de advogado que a CONTRATANTE vier a contratar para sua defesa e honorários de sucumbência."),
    C("Cláusula Décima - Disposições Gerais"),
    P("10.1. A CONTRATADA poderá exercer atividades para outras empresas, ou efetuar negócios em seu nome, e por conta própria."),
    P("10.2. Qualquer alteração deste Contrato somente produzirá efeitos jurídicos se efetuada por escrito e assinada por ambas as partes."),
    P("10.3. Nenhuma das partes poderá ceder qualquer dos seus direitos ou transferir qualquer de suas obrigações oriundas do presente contrato sem o prévio consentimento da outra parte."),
    P("10.4. É expressamente vedado à CONTRATADA realizar qualquer tipo de prestação de serviços, venda de informações e fornecimento de mão de obra por funcionários ou sócios ligados ao CONTRATADO, diretamente aos clientes e fornecedores do CONTRATANTE, sem autorização prévia do CONTRATANTE, pelo prazo de 4 (quatro) anos contados do término da contratação objeto do presente Contrato, sob pena de multa não compensatória de 5 (cinco) vezes o valor da última nota fiscal encaminhada ao CONTRATANTE, sem prejuízo da apuração das perdas e danos."),
    C("Cláusula Décima Primeira- Do Foro"),
    P("11.1 Para solução de eventuais litígios oriundos deste Contrato, as Partes elegem o foro da Comarca de São Paulo, Estado de São Paulo, Brasil, com renúncia de qualquer outro, por mais privilegiado que seja."),
    P("E, assim, por estarem justas e contratadas, as Partes assinam o presente instrumento na presença das duas testemunhas abaixo."),
    '<p style="margin:24pt 0 4pt;">' + dataCidade + "</p>",
    '<p style="margin:36pt 0 4pt;font-weight:bold;">Contratante:</p>',
    '<p style="margin:0 0 4pt;">_____________________________</p>',
    '<p style="margin:0 0 2pt;font-weight:bold;">SELVA AGENCY LTDA.</p>',
    '<p style="margin:0 0 32pt;">Por: Guilherme Teruchkin Felberg</p>',
    '<p style="margin:0 0 4pt;font-weight:bold;">Contratada</p>',
    '<p style="margin:0 0 4pt;">________________________________________</p>',
    '<p style="margin:0 0 2pt;font-weight:bold;">' + form.razaoSocial + "</p>",
    "<p>Por: " + form.nomeRepresentante + "</p>",
  ];

  return (
    "<!DOCTYPE html>" +
    "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
    "xmlns:w='urn:schemas-microsoft-com:office:word' " +
    "xmlns='http://www.w3.org/TR/REC-html40'>" +
    "<head><meta charset='utf-8'>" +
    "<style>@page{size:A4;margin:2.5cm}" +
    "body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.5}</style></head><body>" +
    '<p style="text-align:center;font-weight:bold;font-size:11pt;margin:0 0 24pt;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</p>' +
    parts.join("\n") +
    "</body></html>"
  );
}
export default function Contracts() {
  const [form, setForm] = useState<ContractForm>(DEFAULT_FORM);
  const [showExtract, setShowExtract] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [rawText, setRawText] = useState("");
  const [fileData, setFileData] = useState<{
    base64: string;
    mime: string;
  } | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const extractMutation = trpc.contracts.extractFields.useMutation({
    onSuccess: (data) => {
      setForm((prev) => ({ ...prev, ...(data as Partial<ContractForm>) }));
      toast.success("Dados extraídos. Revise antes de gerar.");
      setShowExtract(false);
    },
    onError: (err) => {
      toast.error("Erro ao extrair: " + err.message);
    },
  });

  function set<K extends keyof ContractForm>(
    field: K,
    value: ContractForm[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const ab = ev.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(ab);
      let b = "";
      for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
      setFileData({ base64: btoa(b), mime: file.type || "application/pdf" });
    };
    reader.readAsArrayBuffer(file);
  }

  function handleExtract() {
    if (inputMode === "text" && !rawText.trim()) {
      toast.error("Cole algum texto primeiro.");
      return;
    }
    if (inputMode === "file" && !fileData) {
      toast.error("Selecione um arquivo primeiro.");
      return;
    }
    extractMutation.mutate({
      text: inputMode === "text" ? rawText : undefined,
      fileBase64: inputMode === "file" ? fileData?.base64 : undefined,
      fileMime: inputMode === "file" ? fileData?.mime : undefined,
    });
  }

  function handleGenerate() {
    const required: (keyof ContractForm)[] = [
      "razaoSocial","cnpj","enderecosede","nomeRepresentante",
      "estadoCivil","rg","rgOrgao","cpf","objeto","valor","data",
    ];
    for (const f of required) {
      if (!form[f]) {
        toast.error("Preencha todos os campos obrigatórios.");
        return;
      }
    }
    if (form.clausulaRevisao && !form.valorRevisao) {
      toast.error("Informe o valor após revisão.");
      return;
    }
    const html = generateContractHTML(form);
    const blob = new Blob(["\ufeff" + html], {
      type: "application/msword;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date(form.data + "T12:00:00");
    const firstName = form.nomeRepresentante.split(" ")[0] ?? "Contrato";
    const mes = MESES[d.getMonth()] ?? "";
    a.download =
      "Contrato_" +
      firstName +
      "_" +
      mes.charAt(0).toUpperCase() +
      mes.slice(1) +
      d.getFullYear() +
      ".doc";
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Contrato gerado.");
  }

  const inp =
    "h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm w-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const lbl = "text-xs text-muted-foreground mb-1 block";

  return (
    <MetaDashboardLayout>
      <div className="max-w-3xl mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileSignature className="w-5 h-5" /> Contratos PJ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gere contratos de prestação de serviços para colaboradores da SELVA.
          </p>
        </div>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <button className="flex items-center justify-between w-full" onClick={() => setShowExtract((v) => !v)}>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" /> Extrair dados com IA
              </CardTitle>
              {showExtract ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {showExtract && (
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="flex gap-2">
                {(["text", "file"] as const).map((m) => (
                  <button key={m} onClick={() => setInputMode(m)}
                    className={"text-xs px-3 py-1.5 rounded border transition-colors " + (inputMode === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
                    {m === "text" ? "Colar texto" : "Upload PDF / imagem"}
                  </button>
                ))}
              </div>
              {inputMode === "text" ? (
                <Textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Cole aqui qualquer texto com os dados do colaborador..." rows={6} className="text-sm resize-y" />
              ) : (
                <div>
                  <div className="border-2 border-dashed border-border rounded-md p-6 text-center cursor-pointer hover:border-muted-foreground transition-colors" onClick={() => fileRef.current?.click()}>
                    <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{fileName || "Clique para selecionar PDF ou imagem"}</p>
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleFileChange} />
                </div>
              )}
              <Button onClick={handleExtract} disabled={extractMutation.isPending} size="sm" className="w-full">
                {extractMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Extraindo...</> : <><Sparkles className="w-4 h-4 mr-2" />Extrair dados</>}
              </Button>
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Dados da contratada</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <div><label className={lbl}>Razão social *</label><input className={inp} placeholder="NOME DA EMPRESA 12345678900" value={form.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Tipo</label><Select value={form.tipo} onValueChange={(v) => set("tipo", v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MEI">MEI</SelectItem><SelectItem value="EI">Empresária individual</SelectItem><SelectItem value="LTDA">LTDA</SelectItem></SelectContent></Select></div>
              <div><label className={lbl}>CNPJ *</label><input className={inp} placeholder="00.000.000/0001-00" value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} /></div>
            </div>
            <div><label className={lbl}>Endereço da sede *</label><input className={inp} placeholder="Rua Exemplo, 123, Bairro, Cidade/UF, CEP 00000-000" value={form.enderecosede} onChange={(e) => set("enderecosede", e.target.value)} /></div>
            <div><label className={lbl}>Nome do representante *</label><input className={inp} placeholder="Nome Completo" value={form.nomeRepresentante} onChange={(e) => set("nomeRepresentante", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Gênero</label><Select value={form.genero} onValueChange={(v) => set("genero", v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="F">Feminino</SelectItem><SelectItem value="M">Masculino</SelectItem></SelectContent></Select></div>
              <div><label className={lbl}>Estado civil *</label><input className={inp} placeholder="solteira / casada / etc." value={form.estadoCivil} onChange={(e) => set("estadoCivil", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={lbl}>RG *</label><input className={inp} placeholder="00.000.000-0" value={form.rg} onChange={(e) => set("rg", e.target.value)} /></div>
              <div><label className={lbl}>Órgão emissor *</label><input className={inp} placeholder="SSP/SP" value={form.rgOrgao} onChange={(e) => set("rgOrgao", e.target.value)} /></div>
              <div><label className={lbl}>CPF *</label><input className={inp} placeholder="000.000.000-00" value={form.cpf} onChange={(e) => set("cpf", e.target.value)} /></div>
            </div>
            <div><label className={lbl}>Endereço residencial <span className="font-normal">(se diferente da sede)</span></label><input className={inp} placeholder="Deixe vazio para usar o endereço da sede" value={form.enderecoResidencial} onChange={(e) => set("enderecoResidencial", e.target.value)} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Dados do contrato</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <div><label className={lbl}>Objeto dos serviços — cláusula 1.1 *</label><Textarea placeholder="gestão, planejamento e execução do composto de trabalhos relacionados a..." value={form.objeto} onChange={(e) => set("objeto", e.target.value)} rows={2} className="text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Valor mensal *</label><input className={inp} placeholder="R$ 3.200,00" value={form.valor} onChange={(e) => set("valor", e.target.value)} /></div>
              <div><label className={lbl}>Data de assinatura *</label><input type="date" className={inp} value={form.data} onChange={(e) => set("data", e.target.value)} /></div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/30">
              <div><p className="text-sm font-medium">Cláusula de revisão de valor</p><p className="text-xs text-muted-foreground mt-0.5">Valor diferente apó os 3 primeiros meses</p></div>
              <button role="switch" aria-checked={form.clausulaRevisao} onClick={() => set("clausulaRevisao", !form.clausulaRevisao)} style={{width:38,height:22,borderRadius:999,border:"none",cursor:"pointer",position:"relative",background:form.clausulaRevisao?"#EF701B":"#d1d5db",transition:".2s"}}><span style={{position: "absolute",width:16,height:16,background:"white",borderRadius:"50%",top:3,left:form.clausulaRevisao?19:3,transition:".2s"}} /></button>
            </div>
            {form.clausulaRevisao && (<div><label className={lbl}>Valor após revisão (mês 4 em diante)</label><input className={inp} placeholder="R$ 3.800,00" value={form.valorRevisao} onChange={(e) => set("valorRevisao", e.target.value)} /></div>)}
          </CardContent>
        </Card>
        <Button onClick={handleGenerate} className="w-full" size="lg">
          <Download className="w-4 h-4 mr-2" /> Gerar contrato .doc
        </Button>
      </div>
    </MetaDashboardLayout>
  );
}
