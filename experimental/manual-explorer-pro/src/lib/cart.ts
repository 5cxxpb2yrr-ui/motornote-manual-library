import type { CartValidation, RepairCart, RepairCartLine, Vehicle } from "../types";
export type ShoppingListFormat="json"|"csv"|"markdown"|"txt";
export function validateCart(cart: RepairCart, requiredPartIds: string[], requiredToolIds: string[]): CartValidation {
  const errors: string[] = [], warnings: string[] = [];
  const present = new Set([...cart.parts, ...cart.tools].map(line => line.partId||line.id));
  for (const id of requiredPartIds) if (!present.has(id)) errors.push("Missing required part: " + id);
  for (const id of requiredToolIds) if (!present.has(id)) errors.push("Missing required tool: " + id);
  for (const line of [...cart.parts, ...cart.tools]) {
    if (!line.oem || line.verification !== "verified") warnings.push("OEM number or vehicle fitment not verified for " + line.name);
    if (line.price == null || !line.url) warnings.push("Vendor price/link unavailable for " + line.name);
  }
  return { valid: errors.length === 0, errors, warnings };
}
export function createCartLine(name: string, relationship?: RepairCartLine["relationship"]): RepairCartLine {
  return { id: crypto.randomUUID(), name: name.trim(), quantity: 1, ...(relationship?{relationship}:{}) };
}
function csv(value:unknown) {
  const text=value==null?"":String(value);
  return '"'+text.replace(/"/g,'""')+'"';
}
export function serializeShoppingList(vehicle:Vehicle,cart:RepairCart,format:ShoppingListFormat):string {
  const items=[...cart.parts,...cart.tools].map(line=>({
    Part:line.name,OEM:line.oem||"",Vendor:line.vendor||"",Price:line.price??"",
    Quantity:line.quantity,DirectLink:line.url||"",Relationship:line.relationship||"unclassified",Source:line.sourcePath||"",Verification:line.verification||"unverified"
  }));
  if(format==="json")return JSON.stringify({vehicle:{id:vehicle.id,year:vehicle.year,make:vehicle.make,model:vehicle.model},procedureId:cart.procedureId,totals:calculateCartTotals(cart),items},null,2);
  const columns=["Part","OEM","Vendor","Price","Quantity","DirectLink","Relationship","Source","Verification"];
  if(format==="csv")return [columns.map(csv).join(","),...items.map(item=>columns.map(column=>csv(item[column as keyof typeof item])).join(","))].join("\n");
  if(format==="markdown")return [
    "# Repair Shopping List",
    "",
    "Vehicle: "+vehicle.year+" "+vehicle.make+" "+vehicle.model,
    "",
    "| "+columns.join(" | ")+" |",
    "| "+columns.map(()=> "---").join(" | ")+" |",
    ...items.map(item=>"| "+columns.map(column=>String(item[column as keyof typeof item]??"").replace(/\|/g,"\\|")).join(" | ")+" |")
  ].join("\n");
  return [
    "LifeOS Manual Explorer Pro — Repair Shopping List",
    "Vehicle: "+vehicle.year+" "+vehicle.make+" "+vehicle.model,
    "",
    ...items.map((item,index)=>(index+1)+". "+item.Part+" × "+item.Quantity+(item.OEM?" · OEM "+item.OEM:"")+(item.Vendor?" · "+item.Vendor:"")+(item.Price!==""?" · $"+item.Price:"")+(item.DirectLink?" · "+item.DirectLink:"")+(item.Source?" · Source "+item.Source:"")+(item.Verification==="verified"?" · Verified":" · Unverified")),
    ""
  ].join("\n");
}
export function calculateCartTotals(cart:RepairCart) {
  const items=[...cart.parts,...cart.tools];
  const priced=items.filter(item=>typeof item.price==="number"&&Number.isFinite(item.price));
  const subtotal=priced.reduce((sum,item)=>sum+(item.price||0)*item.quantity,0);
  return {subtotal,pricedItemCount:priced.length,unpricedItemCount:items.length-priced.length,complete:items.length>0&&priced.length===items.length};
}
