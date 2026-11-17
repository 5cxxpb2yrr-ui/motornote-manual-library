export interface ExtractedOemRow {
  partName: string;
  manufacturer: string;
  partNumber: string;
  listedPrice?: number;
  notes: string;
  sourcePath: string;
  confidence: number;
  verification: "unverified";
}
export function extractOemRows(html: string, sourcePath: string): ExtractedOemRow[] {
  const doc = new DOMParser().parseFromString(html,"text/html");
  const output: ExtractedOemRow[] = [];
  for (const table of [...doc.querySelectorAll("table")]) {
    const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
    if (!headerRow) continue;
    const headers = [...headerRow.querySelectorAll("th,td")].map(cell => cell.textContent?.trim().toLowerCase() || "");
    const partIndex = headers.findIndex(value => value === "part" || value === "part name");
    const manufacturerIndex = headers.findIndex(value => value.includes("manufacturer"));
    const numberIndex = headers.findIndex(value => value.includes("oem") && value.includes("part"));
    const priceIndex = headers.findIndex(value => value.includes("price"));
    const notesIndex = headers.findIndex(value => value.includes("note"));
    if (partIndex < 0 || numberIndex < 0) continue;
    const rows = [...table.querySelectorAll("tr")].slice(1);
    for (const row of rows) {
      const cells = [...row.querySelectorAll("th,td")].map(cell => cell.textContent?.trim() || "");
      const partName = cells[partIndex] || "";
      const partNumber = cells[numberIndex] || "";
      if (!partName || !partNumber) continue;
      const listed = priceIndex >= 0 ? Number(cells[priceIndex].replace(/[^0-9.]/g,"")) : NaN;
      output.push({
        partName, manufacturer: manufacturerIndex >= 0 ? cells[manufacturerIndex] || "" : "",
        partNumber, listedPrice: Number.isFinite(listed) && listed > 0 ? listed : undefined,
        notes: notesIndex >= 0 ? cells[notesIndex] || "" : "",
        sourcePath, confidence: 0.98, verification: "unverified"
      });
    }
  }
  return output;
}