import type { RelationshipType } from "../types";
export interface DetectedPart {
  part: string;
  confidence: number;
  relationship?: RelationshipType;
  evidence: Array<{ sourcePath: string; quote: string; start: number; end: number }>;
}
const DICTIONARY = [
  { id:"water-pump", terms:["water pump","engine coolant pump"], category:"Cooling" },
  { id:"fuel-injector", terms:["fuel injector","injector assembly"], category:"Fuel" },
  { id:"wheel-bearing", terms:["wheel bearing","hub bearing"], category:"Suspension" },
  { id:"thermostat", terms:["thermostat"], category:"Cooling" },
  { id:"coolant", terms:["engine coolant","coolant"], category:"Consumables" },
  { id:"oil-filter", terms:["oil filter"], category:"Engine" },
  { id:"spark-plug", terms:["spark plug"], category:"Engine" },
  { id:"brake-pad", terms:["brake pad","disc pad"], category:"Brakes" },
  { id:"windshield-camera", terms:["eyesight camera","stereo camera"], category:"Driver Assist" }
] as const;

function inferRelationship(context: string, partId: string): RelationshipType | undefined {
  if (/\\b(tool|special service tool|sst)\\b/i.test(context)) return "tool";
  if (partId === "coolant" || /\\b(fluid|grease|sealant|lubricant)\\b/i.test(context)) return "consumable";
  if (/\\b(recommended|if necessary|as required)\\b/i.test(context)) return "recommended";
  if (/\\b(replace|renew|install new|must be replaced)\\b/i.test(context)) return "required";
  return undefined;
}

export function detectParts(sourcePath: string, title: string, body: string): DetectedPart[] {
  const haystack = (title + "\\n" + body).toLowerCase();
  const output: DetectedPart[] = [];
  for (const part of DICTIONARY) {
    const evidence: DetectedPart["evidence"] = [];
    for (const term of part.terms) {
      let from = 0;
      while (from < haystack.length) {
        const at = haystack.indexOf(term, from);
        if (at < 0) break;
        const start = Math.max(0, at - 75), end = Math.min(haystack.length, at + term.length + 75);
        const quote = (title + "\\n" + body).slice(start, end).replace(/\\s+/g, " ").trim();
        evidence.push({ sourcePath, quote, start: at, end: at + term.length });
        from = at + term.length;
      }
    }
    if (!evidence.length) continue;
    const titleMatch = part.terms.some(term => title.toLowerCase().includes(term));
    const confidence = Math.min(0.99, titleMatch ? 0.97 : 0.88 + Math.min(evidence.length - 1, 3) * 0.02);
    const context = evidence.map(item => item.quote).join(" ");
    output.push({ part: part.id, confidence, relationship: inferRelationship(context, part.id), evidence });
  }
  return output.sort((a,b) => b.confidence-a.confidence);
}

export function confidenceBand(value: number): "high" | "medium" | "low" {
  if (value >= 0.9) return "high";
  if (value >= 0.7) return "medium";
  return "low";
}