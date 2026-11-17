import { getDatabase } from "./db";
export interface VendorPrice {
  vendor: string; partNumber: string; price?: number; currency: "USD";
  url: string; availability?: string; checkedAt: string; source: "api" | "search-link";
}
export interface VendorAdapter { name: string; search(partNumber: string): Promise<VendorPrice[]>; }
export interface PricingOptions { timeoutMs?: number; maxConcurrent?: number; cacheTtlSeconds?: number; }
interface PricingCacheRecord { results:VendorPrice[]; expiresAt:number; }
export class PricingAggregator {
  private readonly adapters: VendorAdapter[];
  private readonly cache = new Map<string,{ expiresAt:number; value:VendorPrice[] }>();
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(adapters: VendorAdapter[], private readonly options: PricingOptions = {}) { this.adapters = adapters; }
  private async acquire() {
    const max = Math.max(1,this.options.maxConcurrent ?? 10);
    if (this.active >= max) await new Promise<void>(resolve => this.waiters.push(resolve));
    this.active++;
  }
  private release() { this.active--; this.waiters.shift()?.(); }
  private async readPersistentCache(key:string) {
    try {
      const record=await (await getDatabase()).get("pricingCache",key) as PricingCacheRecord|undefined;
      if(record&&record.expiresAt>Date.now()) {
        this.cache.set(key,{expiresAt:record.expiresAt,value:record.results});
        return record.results;
      }
      if(record)await (await getDatabase()).delete("pricingCache",key);
    } catch { /* private browsing or storage quota: use in-memory cache */ }
    return null;
  }
  private async writePersistentCache(key:string,results:VendorPrice[],expiresAt:number) {
    try { await (await getDatabase()).put("pricingCache",{results,expiresAt},key); }
    catch { /* the in-memory result remains usable when IndexedDB is unavailable */ }
  }
  async search(partNumber: string): Promise<VendorPrice[]> {
    const normalized = partNumber.trim();
    if (!normalized) return [];
    const cached = this.cache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const persistent=await this.readPersistentCache(normalized);
    if(persistent)return persistent;
    const results = await Promise.all(this.adapters.map(async adapter => {
      await this.acquire();
      try {
        const timeout = this.options.timeoutMs ?? 3000;
        return await Promise.race([
          adapter.search(normalized),
          new Promise<VendorPrice[]>(resolve => setTimeout(() => resolve([]),timeout))
        ]);
      } catch { return []; }
      finally { this.release(); }
    }));
    const flattened = results.flat().sort((a,b)=>(a.price ?? Number.POSITIVE_INFINITY)-(b.price ?? Number.POSITIVE_INFINITY));
    const expiresAt=Date.now()+(this.options.cacheTtlSeconds ?? 3600)*1000;
    this.cache.set(normalized,{expiresAt,value:flattened});
    await this.writePersistentCache(normalized,flattened,expiresAt);
    return flattened;
  }
}
export function searchLinkAdapter(name: string, url: (partNumber:string)=>string): VendorAdapter {
  return {
    name,
    async search(partNumber) {
      return [{ vendor:name, partNumber, currency:"USD", url:url(encodeURIComponent(partNumber)),
        checkedAt:new Date().toISOString(), source:"search-link" }];
    }
  };
}
export const vendorSearchAdapters = [
  searchLinkAdapter("RockAuto",number=>"https://www.rockauto.com/en/partsearch/?partnum="+number),
  searchLinkAdapter("PartsGeek",number=>"https://www.partsgeek.com/search.html?query="+number),
  searchLinkAdapter("ToyotaPartsDeal",number=>"https://www.toyotapartsdeal.com/search/?q="+number),
  searchLinkAdapter("Subaru Parts",number=>"https://www.subarupartsdeal.com/search/?q="+number),
  searchLinkAdapter("NAPA",number=>"https://www.napaonline.com/en/search?text="+number),
  searchLinkAdapter("O'Reilly",number=>"https://www.oreillyauto.com/search?q="+number),
  searchLinkAdapter("AutoZone",number=>"https://www.autozone.com/searchresult?searchText="+number),
  searchLinkAdapter("Partsouq",number=>"https://partsouq.com/en/search/all?q="+number),
  searchLinkAdapter("Amayama",number=>"https://www.amayama.com/en/catalogs/search?query="+number),
  searchLinkAdapter("eBay",number=>"https://www.ebay.com/sch/i.html?_nkw="+number),
  searchLinkAdapter("Amazon",number=>"https://www.amazon.com/s?k="+number)
];