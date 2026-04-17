/**
 * Data Store Centralizado
 * 
 * Implementa um cache centralizado para dados da Meta Ads API.
 * Todas as abas (Dashboard, Campanhas, Anomalias, Sugestões) consomem do mesmo cache.
 * 
 * Benefícios:
 * - Dados consistentes entre todas as abas
 * - Reduz chamadas à Meta API
 * - Permite detecção de anomalias com dados sincronizados
 * - Sugestões IA usam dados atualizados
 */

interface CacheEntry {
  data: any;
  timestamp: number;
  expiresAt: number;
}

interface DataStoreCache {
  accountMetrics: Map<string, CacheEntry>;
  campaigns: Map<string, CacheEntry>;
  adSets: Map<string, CacheEntry>;
  ads: Map<string, CacheEntry>;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const dataStore: DataStoreCache = {
  accountMetrics: new Map(),
  campaigns: new Map(),
  adSets: new Map(),
  ads: new Map(),
};

/**
 * Gera chave de cache baseada em accountId e período
 */
function getCacheKey(accountId: number, startDate?: string, endDate?: string): string {
  return `${accountId}:${startDate || 'all'}:${endDate || 'all'}`;
}

/**
 * Verifica se cache ainda é válido
 */
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() < entry.expiresAt;
}

/**
 * Armazena dados de métricas da conta em cache
 */
export function setCacheAccountMetrics(
  accountId: number,
  data: any,
  startDate?: string,
  endDate?: string
): void {
  const key = getCacheKey(accountId, startDate, endDate);
  dataStore.accountMetrics.set(key, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_TTL,
  });
}

/**
 * Recupera dados de métricas da conta do cache
 */
export function getCacheAccountMetrics(
  accountId: number,
  startDate?: string,
  endDate?: string
): any | null {
  const key = getCacheKey(accountId, startDate, endDate);
  const entry = dataStore.accountMetrics.get(key);
  
  if (!entry) return null;
  if (!isCacheValid(entry)) {
    dataStore.accountMetrics.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Armazena dados de campanhas em cache
 */
export function setCacheCampaigns(
  accountId: number,
  data: any,
  startDate?: string,
  endDate?: string
): void {
  const key = getCacheKey(accountId, startDate, endDate);
  dataStore.campaigns.set(key, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_TTL,
  });
}

/**
 * Recupera dados de campanhas do cache
 */
export function getCacheCampaigns(
  accountId: number,
  startDate?: string,
  endDate?: string
): any | null {
  const key = getCacheKey(accountId, startDate, endDate);
  const entry = dataStore.campaigns.get(key);
  
  if (!entry) return null;
  if (!isCacheValid(entry)) {
    dataStore.campaigns.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Armazena dados de conjuntos de anúncios em cache
 */
export function setCacheAdSets(
  accountId: number,
  data: any
): void {
  const key = getCacheKey(accountId);
  dataStore.adSets.set(key, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_TTL,
  });
}

/**
 * Recupera dados de conjuntos de anúncios do cache
 */
export function getCacheAdSets(accountId: number): any | null {
  const key = getCacheKey(accountId);
  const entry = dataStore.adSets.get(key);
  
  if (!entry) return null;
  if (!isCacheValid(entry)) {
    dataStore.adSets.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Armazena dados de anúncios em cache
 */
export function setCacheAds(
  accountId: number,
  data: any
): void {
  const key = getCacheKey(accountId);
  dataStore.ads.set(key, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_TTL,
  });
}

/**
 * Recupera dados de anúncios do cache
 */
export function getCacheAds(accountId: number): any | null {
  const key = getCacheKey(accountId);
  const entry = dataStore.ads.get(key);
  
  if (!entry) return null;
  if (!isCacheValid(entry)) {
    dataStore.ads.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Limpa todo o cache de uma conta
 */
export function invalidateAccountCache(accountId: number): void {
  const prefix = `${accountId}:`;
  
  // Limpar todos os caches que começam com o accountId
  for (const [key] of dataStore.accountMetrics) {
    if (key.startsWith(prefix)) {
      dataStore.accountMetrics.delete(key);
    }
  }
  
  for (const [key] of dataStore.campaigns) {
    if (key.startsWith(prefix)) {
      dataStore.campaigns.delete(key);
    }
  }
  
  for (const [key] of dataStore.adSets) {
    if (key.startsWith(prefix)) {
      dataStore.adSets.delete(key);
    }
  }
  
  for (const [key] of dataStore.ads) {
    if (key.startsWith(prefix)) {
      dataStore.ads.delete(key);
    }
  }
}

/**
 * Retorna informações sobre o cache (para debug)
 */
export function getCacheStats(): {
  accountMetrics: number;
  campaigns: number;
  adSets: number;
  ads: number;
  lastUpdated: number;
} {
  return {
    accountMetrics: dataStore.accountMetrics.size,
    campaigns: dataStore.campaigns.size,
    adSets: dataStore.adSets.size,
    ads: dataStore.ads.size,
    lastUpdated: Date.now(),
  };
}
