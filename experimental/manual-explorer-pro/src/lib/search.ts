import type { SearchRecord } from "../types";
export interface SearchQuery { text: string; vehicle?: "scion" | "subaru"; section?: string; }
export function parseSearchQuery(input: string): SearchQuery {
  const query: SearchQuery = { text: "" };
  const text: string[] = [];
  for (const term of input.trim().split(/\s+/).filter(Boolean)) {
    const match = term.match(/^(vehicle|section):(.+)$/i);
    if (!match) { text.push(term); continue; }
    if (match[1].toLowerCase() === "vehicle") {
      const value = match[2].toLowerCase();
      if (value === "scion" || value === "subaru") query.vehicle = value;
    } else query.section = match[2].toLowerCase();
  }
  query.text = text.join(" ");
  return query;
}
export function searchRecords(records: SearchRecord[], input: string): SearchRecord[] {
  const query = parseSearchQuery(input);
  const terms = query.text.toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter(record => {
    const path = record.path.toLowerCase();
    const content = (record.title + " " + record.text + " " + path).toLowerCase();
    if (!terms.every(term => content.includes(term))) return false;
    if (query.vehicle && !path.includes(query.vehicle)) return false;
    if (query.section && !content.includes(query.section)) return false;
    return true;
  }).sort((a,b) => {
    const score = (record: SearchRecord) => {
      const title = record.title.toLowerCase();
      return (query.text && title.includes(query.text.toLowerCase()) ? 100 : 0) + terms.filter(term => title.includes(term)).length * 10;
    };
    return score(b)-score(a);
  });
}