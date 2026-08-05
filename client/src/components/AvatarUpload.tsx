/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Avatar clicável — o avatar É o botão de trocar a foto
 * ─────────────────────────────────────────────────────────────────────────────
 *  Usado em dois lugares que parecem iguais e NÃO são a mesma entidade:
 *
 *   • cliente do Tracker (`meta_ad_accounts`) — Configurações → Contas
 *   • cliente do cofre  (`access_clients`)    — Acessos
 *
 *  Eles não compartilham foto de propósito: "Santé" e "Carol Garrafa" são dois
 *  clientes distintos no cofre e uma única conta de mídia no Tracker, e há
 *  cliente com acesso guardado que nunca teve acompanhamento. Cada lado tem a
 *  sua imagem; o que se compartilha é este componente, não o dado.
 *
 *  Três garantias, iguais nos dois usos:
 *   1. Nunca fica sem representação: foto > iniciais.
 *   2. Prévia imediata (objectURL) enquanto sobe — num upload lento, sem isso o
 *      clique parece não ter funcionado e a pessoa escolhe o arquivo de novo.
 *   3. Dá para desfazer, quando o chamador oferece remoção.
 *
 *  A permissão real é do servidor; `podeEditar` só evita oferecer uma ação que
 *  voltaria 403.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

/** Iniciais do nome — fallback quando não há foto nenhuma. */
export function iniciaisDe(nome: string | null | undefined): string {
  const limpo = (nome ?? "").trim();
  if (!limpo) return "??";
  const partes = limpo.split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : limpo.slice(0, 2);
  return letras.toUpperCase();
}

export function AvatarUpload({
  nome,
  pictureUrl,
  podeEditar,
  endpoint,
  campoId,
  id,
  onAtualizado,
  onRemover,
  removendo = false,
  className = "w-10 h-10 rounded-full",
  textoClasse = "text-xs",
}: {
  nome: string | null | undefined;
  /** URL já resolvida pelo servidor. */
  pictureUrl: string | null | undefined;
  podeEditar: boolean;
  /** Rota multipart que recebe o binário. */
  endpoint: string;
  /** Nome do campo do formulário que carrega o id (accountId, accessClientId…). */
  campoId: string;
  id: number;
  /** Recarrega a fonte da URL depois do upload. */
  onAtualizado: () => Promise<unknown> | unknown;
  /** Só aparece quando existe foto própria para remover. */
  onRemover?: () => void;
  removendo?: boolean;
  className?: string;
  textoClasse?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);

  // objectURL segura o arquivo em memória até ser revogado. Sem esta limpeza,
  // trocar a foto de vários clientes numa sessão vaza um blob por troca.
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  async function enviar(file: File) {
    const url = URL.createObjectURL(file);
    setPrevia(url);
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append(campoId, String(id));
      const resp = await fetch(endpoint, { method: "POST", body: fd, credentials: "include" });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha no upload.");
      }
      await onAtualizado();
      toast.success("Foto atualizada.");
    } catch (e: any) {
      setPrevia(null); // prévia que sobrevive a erro mente sobre o estado salvo
      toast.error(e?.message ?? "Falha no upload.");
    } finally {
      setEnviando(false);
    }
  }

  const mostrada = previa ?? pictureUrl ?? null;

  /**
   * Com foto própria, o clique abre um MENU (trocar / apagar). Sem foto, abre o
   * seletor direto — um menu de uma opção só é um clique a mais para nada.
   *
   * A lixeira solta ao lado saiu por isto: encostada no avatar, dentro de um
   * card que também tem ações do CLIENTE, ela lia como "apagar o cliente". A
   * ação destrutiva agora mora dentro do menu daquilo que ela apaga.
   */
  const temMenu = podeEditar && !!onRemover;

  useEffect(() => {
    if (!menuAberto) return;
    const fechar = (e: MouseEvent) => {
      if (!raizRef.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuAberto(false); };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [menuAberto]);

  return (
    <div ref={raizRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => {
          if (!podeEditar || enviando) return;
          if (temMenu) setMenuAberto((v) => !v);
          else fileRef.current?.click();
        }}
        disabled={!podeEditar || enviando}
        title={podeEditar ? (temMenu ? "Opções da imagem" : "Adicionar imagem") : (nome ?? "")}
        aria-label={podeEditar ? `Imagem de ${nome ?? "cliente"}` : undefined}
        aria-haspopup={temMenu ? "menu" : undefined}
        aria-expanded={temMenu ? menuAberto : undefined}
        className={`group ${className} bg-muted border border-border overflow-hidden flex items-center justify-center relative ${podeEditar ? "cursor-pointer" : "cursor-default"}`}
      >
        {mostrada
          ? <img src={mostrada} alt={nome ?? ""} className="w-full h-full object-cover" />
          : <span className={`${textoClasse} font-medium text-muted-foreground`}>{iniciaisDe(nome)}</span>}

        {/* Convite ao clique só no hover: o card não vira mural de ícones
            quando ninguém está mexendo em foto. */}
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

      {temMenu && menuAberto && (
        <div role="menu"
          className="absolute z-30 left-0 top-full mt-1 w-44 rounded-lg border border-border bg-card shadow-lg py-1">
          <button role="menuitem" type="button"
            onClick={() => { setMenuAberto(false); fileRef.current?.click(); }}
            className="w-full text-left text-xs px-3 py-2 hover:bg-muted/60 flex items-center gap-2">
            <Camera className="w-3.5 h-3.5" /> Trocar imagem
          </button>
          <button role="menuitem" type="button"
            onClick={() => { setMenuAberto(false); onRemover?.(); }}
            disabled={removendo || enviando}
            /* "imagem", não "foto do cliente": o texto precisa deixar claro que
               isto não apaga o cliente. */
            className="w-full text-left text-xs px-3 py-2 hover:bg-muted/60 text-destructive flex items-center gap-2 disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" /> Apagar imagem
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar(f);
          e.target.value = ""; // permite reescolher o MESMO arquivo após um erro
        }}
      />
    </div>
  );
}
