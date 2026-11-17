import type { CartValidation, RepairCart, RepairCartLine } from "../types";
export function validateCart(cart: RepairCart, requiredPartIds: string[], requiredToolIds: string[]): CartValidation {
  const errors: string[] = [], warnings: string[] = [];
  const present = new Set([...cart.parts, ...cart.tools].map(line => line.id));
  for (const id of requiredPartIds) if (!present.has(id)) errors.push("Missing required part: " + id);
  for (const id of requiredToolIds) if (!present.has(id)) errors.push("Missing required tool: " + id);
  for (const line of [...cart.parts, ...cart.tools]) {
    if (!line.oem) warnings.push("OEM number not verified for " + line.name);
    if (line.price == null || !line.url) warnings.push("Vendor price/link unavailable for " + line.name);
  }
  return { valid: errors.length === 0, errors, warnings };
}
export function createCartLine(name: string, relationship: RepairCartLine["relationship"] = "required"): RepairCartLine {
  return { id: crypto.randomUUID(), name: name.trim(), quantity: 1, relationship };
}