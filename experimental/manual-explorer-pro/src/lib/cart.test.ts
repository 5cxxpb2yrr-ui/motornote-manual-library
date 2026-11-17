import { calculateCartTotals, serializeShoppingList, validateCart } from "./cart";
import { OWNED_VEHICLES } from "../data/vehicles";
import type { RepairCart } from "../types";
describe("repair cart validation", () => {
  const cart: RepairCart = { vehicleId:"2006-scion-xb",procedureId:"water-pump",parts:[],tools:[] };
  it("reports missing required parts and tools", () => {
    const result=validateCart(cart,["water-pump"],["pulley-holder"]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
  it("warns when price and OEM evidence are absent", () => {
    const result=validateCart({...cart,parts:[{id:"pump",name:"Water pump",quantity:1,relationship:"required"}]},[],[]);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("matches required parts using stable part IDs",()=>{
    const cartWithPump:RepairCart={...cart,parts:[{id:"row-uuid",partId:"water-pump",name:"Water Pump",quantity:1,relationship:"required"}]};
    expect(validateCart(cartWithPump,["water-pump"],[]).valid).toBe(true);
  });

  it("does not invent totals for unpriced parts",()=>{
    const result=calculateCartTotals({...cart,parts:[{id:"pump",name:"Water Pump",quantity:2,relationship:"required"}]});
    expect(result.subtotal).toBe(0);
    expect(result.pricedItemCount).toBe(0);
    expect(result.unpricedItemCount).toBe(1);
    expect(result.complete).toBe(false);
  });

  it("exports JSON, CSV, Markdown and TXT shopping lists",()=>{
    const sample:RepairCart={vehicleId:"2006-scion-xb",procedureId:"water-pump",parts:[{id:"pump",name:"Water Pump",quantity:1,relationship:"required",oem:"161002915683"}],tools:[]};
    expect(serializeShoppingList(OWNED_VEHICLES[0],sample,"json")).toContain("Water Pump");
    expect(serializeShoppingList(OWNED_VEHICLES[0],sample,"csv")).toContain('"Part","OEM"');
    expect(serializeShoppingList(OWNED_VEHICLES[0],sample,"markdown")).toContain("| Water Pump |");
    expect(serializeShoppingList(OWNED_VEHICLES[0],sample,"txt")).toContain("Water Pump");
  });
});
