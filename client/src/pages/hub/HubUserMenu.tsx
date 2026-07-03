/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Menu de usuário (rodapé da sidebar global)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Conta logada acompanhando toda a shell do Selva Spaces (Home + apps
 *  integrados). Colapsado → avatar/iniciais; expandido → nome + e-mail.
 *  Menu: Meu perfil, Configurações, Sair (usa o logout já existente).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useLocation } from "wouter";
import { ChevronsUpDown, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ACTIVE_CLR = "#D4537E";
const TEXT_DIM = "rgba(255,255,255,0.35)";
const HOVER_CLS = "hover:bg-white/[0.06]";

export function HubUserMenu({ open }: { open: boolean }) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const name = (user as any)?.name ?? "Usuário";
  const email = (user as any)?.email ?? "";
  const initial = name?.[0]?.toUpperCase() ?? "U";
  const avatarUrl = (user as any)?.avatarUrl as string | undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`w-full flex items-center ${open ? "gap-2.5 px-2" : "justify-center"} py-2 rounded-lg transition-all ${HOVER_CLS}`}
          title={open ? undefined : name}
        >
          <Avatar className="w-7 h-7 flex-shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="text-xs font-bold" style={{ background: "rgba(212,83,126,0.3)", color: ACTIVE_CLR }}>
              {initial}
            </AvatarFallback>
          </Avatar>
          {open && (
            <>
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-xs font-semibold truncate" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {name}
                </p>
                <p className="text-[10px] truncate" style={{ color: TEXT_DIM }}>
                  {email}
                </p>
              </div>
              <ChevronsUpDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: TEXT_DIM }} />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm font-medium truncate">{name}</span>
          {email && <span className="text-xs text-muted-foreground truncate">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")}>
          <UserIcon className="w-4 h-4 mr-2" />
          Meu perfil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-destructive">
          <LogOut className="w-4 h-4 mr-2" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
