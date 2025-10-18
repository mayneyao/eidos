const CACHE_PREFIX = 'v3_compiler_cache_';
const CACHE_EXPIRE_TIME = 7 * 24 * 60 * 60 * 1000;
interface CacheItem {
    code: string;
    timestamp: number;
}

function generateCacheKey(code: string): string {
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
        hash = ((hash << 5) - hash) + code.charCodeAt(i);
        hash = hash & hash;
    }
    return CACHE_PREFIX + Math.abs(hash);
}

function hasCache(key: string): boolean {
    const item = localStorage.getItem(key);
    if (!item) return false;

    const cacheItem: CacheItem = JSON.parse(item);
    if (Date.now() - cacheItem.timestamp > CACHE_EXPIRE_TIME) {
        localStorage.removeItem(key);
        return false;
    }
    return true;
}

function getCache(key: string): any {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const cacheItem: CacheItem = JSON.parse(item);
    return JSON.parse(cacheItem.code);
}

function setCache(key: string, compiledCode: any): void {
    const cacheItem: CacheItem = {
        code: JSON.stringify(compiledCode),
        timestamp: Date.now()
    };
    try {
        localStorage.setItem(key, JSON.stringify(cacheItem));
    } catch (e) {
        clearExpiredCache();
    }
}

function clearExpiredCache(): void {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_PREFIX)) {
            if (!hasCache(key)) {
                localStorage.removeItem(key);
            }
        }
    }
}

export { generateCacheKey, hasCache, getCache, setCache, clearExpiredCache };