export interface VendorPrice {
  vendor: string; partNumber: string; price?: number; currency: "USD";
  url: string; availability?: string; checkedAt: string; source: "api" | "search-link";
}
export interface VendorAdapter { name: string; search(partNumber: string): Promise<VendorPrice[]>; }
export interface PricingOptions { timeoutMs?: number; maxConcurrent?: number; cacheTtlSeconds?: number; }

export class PricingAggregator {
  private readonly adapters: VendorAdapter[];
  private readonly cache = new Map<string,{ expiresAt:number; value:VendorPrice[] }>();
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(adapters: VendorAdapter[], private readonly options: PricingOptions = {}) {
    this.adapters = adapters;
  }
  private async acquire() {
    const max = Math.max(1,this.options.maxConcurrent ?? 10);
    if (this.active >= max) await new Promise<void>(resolve => this.waiters.push(resolve));
    this.active++;
  }
  private release() { this.active--; this.waiters.shift()?.(); }
  async search(partNumber: string): Promise<VendorPrice[]> {
    const normalized = partNumber.trim();
    if (!normalized) return [];
    const cached = this.cache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
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
    this.cache.set(normalized,{expiresAt:Date.now()+(this.options.cacheTtlSeconds ?? 3600)*1000,value:flattened});
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
  searchLinkAdapter("eBay", number => "https://www.ebay.com/sch/i.html?_nkw="+number),
  searchLinkAdapter("Amazon", number => "https://www.amazon.com/s?k="+number),
  searchLinkAdapter("PartsGeek", number => "https://www.partsgeek.com/search.html?query="+number)
];