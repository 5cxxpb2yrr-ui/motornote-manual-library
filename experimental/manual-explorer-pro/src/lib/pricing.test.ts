import { PricingAggregator, searchLinkAdapter, type VendorAdapter, type VendorPrice } from "./pricing";
describe("pricing aggregation",()=>{
  it("sorts verified API quotes and caches vendor lookups",async()=>{
    const adapter:VendorAdapter={name:"MockVendor",search:jest.fn().mockResolvedValue([
      {vendor:"MockVendor",partNumber:"16100-29157",price:84,currency:"USD",url:"https://vendor.example/part",availability:"In Stock",checkedAt:"2026-11-17T00:00:00Z",source:"api"},
      {vendor:"MockVendor",partNumber:"16100-29157",price:71,currency:"USD",url:"https://vendor.example/part2",availability:"In Stock",checkedAt:"2026-11-17T00:00:00Z",source:"api"}
    ])};
    const aggregator=new PricingAggregator([adapter],{cacheTtlSeconds:3600,maxConcurrent:2});
    const first=await aggregator.search("16100-29157");
    const second=await aggregator.search("16100-29157");
    expect(first[0].price).toBe(71);
    expect(second).toEqual(first);
    expect(adapter.search).toHaveBeenCalledTimes(1);
  });
  it("returns a vendor search link without pretending it is a live price",async()=>{
    const adapter=searchLinkAdapter("MockVendor",number=>"https://vendor.example/search?q="+number);
    const result=await adapter.search("16100-29157");
    expect(result[0].source).toBe("catalog-link");
    expect(result[0].price).toBeUndefined();
  });
  it("times out a slow vendor without blocking the other adapters",async()=>{
    const slow:VendorAdapter={name:"Slow",search:()=>new Promise<VendorPrice[]>(()=>undefined)};
    const fast:VendorAdapter={name:"Fast",search:async()=>[{vendor:"Fast",partNumber:"x",price:12,currency:"USD",url:"https://vendor.example/x",checkedAt:"2026-11-17T00:00:00Z",source:"api"}]};
    const result=await new PricingAggregator([slow,fast],{timeoutMs:5}).search("x");
    expect(result.map(item=>item.vendor)).toEqual(["Fast"]);
  });
});