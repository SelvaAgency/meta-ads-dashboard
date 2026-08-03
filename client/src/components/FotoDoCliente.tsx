/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Foto do cliente — clicar no avatar troca a imagem
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fica nas Configurações do Tracker, no card de cada cliente. O avatar É o
 *  botão: quem quer trocar a foto de um cliente clica na foto dele, não procura
 *  um botão em outro canto da tela.
 *
 *  Três coisas que o componente garante:
 *
 *   1. Nunca fica sem representação. Foto enviada à mão > foto da Meta >
 *      iniciais do nome. As iniciais não são um estado de erro: a maioria dos
 *      clientes nunca teve foto e continua legível assim.
 *   2. O preview é imediato. O arquivo escolhido aparece na hora (objectURL)
 *      enquanto sobe — sem isso, num upload lento o clique parece não ter
 *      funcionado e o usuário escolhe o arquivo de novo.
 *   3. Dá para desfazer. "Remover" apaga só a foto enviada à mão e volta para a
 *      da Meta / iniciais; a conta, o vínculo e os dados não são tocados.
 *
 *  O binário sobe por /api/uploads/account-picture (multipart não passa bem por
 *  tRPC). A permissão real é do servidor — aqui o `podeEditar` só evita
 *  oferecer uma ação que voltaria 403.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/** Iniciais do nome — fallback quando não há foto nenhuma. */
export function iniciaisDe(nome: string | null | undefined): string {
  const limpo = (nome ?? "").trim();
  if (!limpo) return "??";
  const partes = limpo.split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : limpo.slice(0, 2);
  return letras.toUpperCase();
}

export function FotoDoCliente({
  accountId,
  nome,
  pictureUrl,
  temFotoPropria,
  podeEditar,
}: {
  accountId: number;
  nome: string | null | undefined;
  /** URL já resolvida pelo servidor (foto enviada à mão OU a da Meta). */
  pictureUrl: string | null | undefined;
  /** Existe foto enviada à mão? Só ela pode ser removida. */
  temFotoPropria: boolean;
  podeEditar: boolean;
}) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);

  // objectURL segura o arquivo em memória até ser revogado. Sem esta limpeza,
  // trocar a foto de vários clientes numa sessão vaza um blob por troca.
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  const remover = trpc.accounts.removerFoto.useMutation({
    onSuccess: async () => {
      setPrevia(null);
      await utils.accounts.list.invalidate();
      toast.success("Foto removida.");
    },
    onError: (e) => toast.error(e.message),
  });

  async function enviar(file: File) {
    const url = URL.createObjectURL(file);
    setPrevia(url);
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("accountId", String(accountId));
      const resp = await fetch("/api/uploads/account-picture", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha no upload.");
      }
      // A lista é a fonte da URL exibida em toda a aplicação (sidebar, seletor,
      // cabeçalho). Invalidar aqui faz a foto nova aparecer nos três de uma vez.
      await utils.accounts.list.invalidate();
      toast.success("Foto atualizada.");
    } catch (e: any) {
      setPrevia(null); // volta ao que estava — prévia que sobrevive a erro mente
      toast.error(e?.message ?? "Falha no upload.");
    } finally {
      setEnviando(false);
    }
  }

  const mostrada = previa ?? pictureUrl ?? null;
  const iniciais = iniciaisDe(nome);

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="relative">
        <button
          type="button"
          onClick={() => podeEditar && !enviando && fileRef.current?.click()}
          disabled={!podeEditar || enviando}
          title={podeEditar ? "Clique para trocar a foto do cliente" : (nome ?? "")}
          aria-label={podeEditar ? `Trocar a foto de ${nome ?? "cliente"}` : undefined}
          className={`group w-10 h-10 rounded-full bg-muted border border-border overflow-hidden flex items-center justify-center relative ${podeEditar ? "cursor-pointer" : "cursor-default"}`}
        >
          {mostrada
            ? <img src={mostrada} alt={nome ?? ""} className="w-full h-full object-cover" />
            : <span className="text-xs font-medium text-muted-foreground">{iniciais}</span>}

          {/* Convite ao clique: só aparece no hover, para o card não virar um
              mural de ícones quando ninguém está mexendo em foto. */}
          {podeEditar && !enviando && (
            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/55">
              <Camera className="w-4 h-4 text-white" />
            </span>
          )}
          {enviando && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            </span>
          )}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) enviar(f);
            e.target.value = ""; // permite reescolher o MESMO arquivo depois de um erro
          }}
        />
      </div>

      {podeEditar && temFotoPropria && (
        <button
          type="button"
          onClick={() => remover.mutate({ accountId })}
          disabled={remover.isPending || enviando}
          title="Remover a foto enviada — volta para a foto da Meta ou as iniciais"
          className="p-1 rounded-md text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
