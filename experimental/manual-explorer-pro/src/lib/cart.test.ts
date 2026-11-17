import { serializeShoppingList, validateCart } from "./cart";
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

  it("exports JSON, CSV, Markdown and TXT shopping lists",()=>{
    const sample:RepairCart={vehicleId:"2006-scion-xb",procedureId:"water-pump",parts:[{id:"pump",name:"Water Pump",quantity:1,relationship:"required",oem:"161002915683"}],tools:[]};
    expect(serializeShoppingList(OWNED_VEHICLES[0],sample,"json")).toContain("Water Pump");
    expect(serializeShoppingList(OWNED_VEHICLES[0],sample,"csv")).toContain('"Part","OEM"');
    expect(serializeShoppingList(OWNED_VEHICLES[0],sample,"markdown")).toContain("| Water Pump |");
    expect(serializeShoppingList(OWNED_VEHICLES[0],sample,"txt")).toContain("Water Pump");
  });
});
