import { validateCart } from "./cart";
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
});