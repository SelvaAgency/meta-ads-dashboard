/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — STORE LOCAL (fase intermediária)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Camada de dados editáveis do Selva Spaces (News, SelvaTV, preferências de
 *  perfil) enquanto NÃO existe backend para persistir. Guarda em localStorage
 *  e notifica os componentes (mesma aba e entre abas).
 *
 *  ➜ TODO(backend): trocar `read`/`write` de cada coleção por chamadas tRPC
 *    (ex.: news.list/news.upsert, selvaTV.list/upsert, profile.update). A UI
 *    (Configurações, NewsTicker, SelvaTV) NÃO precisa mudar — só a fonte.
 *
 *  Nada aqui guarda credenciais, tokens ou dados de cliente. `birthDate` é
 *  apenas uma prévia local para testar o aviso de aniversário até o backend
 *  existir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useSyncExternalStore } from "react";
import { getNews } from "./hubMocks";

export interface StoredNews {
  id: string;
  text: string;
  enabled: boolean;
}

export interface StoredTVImage {
  id: string;
  src: string;
  alt: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  enabled: boolean;
}

export interface ProfilePrefs {
  /** "MM-DD" — apenas dia/mês bastam para o aviso de aniversário. */
  birthDate?: string;
  jobTitle?: string;
  // NOTA: sem avatarUrl. Upload de foto depende de storage real (ver
  // HubSettings → TODO(storage)); até lá o avatar é por iniciais.
}

const KEYS = {
  news: "selva-spaces:news",
  tv: "selva-spaces:selvatv",
  profile: "selva-spaces:profile",
} as const;

// Seed inicial das News a partir do mock atual (fica editável no admin).
const DEFAULT_NEWS: StoredNews[] = getNews().map((n) => ({ id: n.id, text: n.text, enabled: true }));
const DEFAULT_TV: StoredTVImage[] = [];
const DEFAULT_PROFILE: ProfilePrefs = {};

// ─── Pub/sub + cache estável (para useSyncExternalStore) ─────────────────────
const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key && cache.has(e.key)) {
      cache.delete(e.key); // relê no próximo getSnapshot
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function get<T>(key: string, fallback: T): T {
  if (!cache.has(key)) {
    try {
      const raw = localStorage.getItem(key);
      cache.set(key, raw ? (JSON.parse(raw) as T) : fallback);
    } catch {
      cache.set(key, fallback);
    }
  }
  return cache.get(key) as T;
}

function set<T>(key: string, value: T) {
  cache.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* espaço/privacidade indisponível — mantém em memória */
  }
  emit();
}

function useLocal<T>(key: string, fallback: T) {
  const value = useSyncExternalStore(
    subscribe,
    () => get(key, fallback),
    () => fallback
  );
  const setValue = useCallback((next: T) => set(key, next), [key]);
  return [value, setValue] as const;
}

// ─── Hooks públicos ──────────────────────────────────────────────────────────
export const useNewsStore = () => useLocal<StoredNews[]>(KEYS.news, DEFAULT_NEWS);
export const useSelvaTVStore = () => useLocal<StoredTVImage[]>(KEYS.tv, DEFAULT_TV);
export const useProfilePrefs = () => useLocal<ProfilePrefs>(KEYS.profile, DEFAULT_PROFILE);

// Leituras diretas (fora de componentes), se necessário.
export const readNews = () => get<StoredNews[]>(KEYS.news, DEFAULT_NEWS);
export const readSelvaTV = () => get<StoredTVImage[]>(KEYS.tv, DEFAULT_TV);
export const readProfilePrefs = () => get<ProfilePrefs>(KEYS.profile, DEFAULT_PROFILE);
