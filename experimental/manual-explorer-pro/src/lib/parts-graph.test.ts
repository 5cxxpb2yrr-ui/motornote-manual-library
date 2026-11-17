import { OWNED_VEHICLES } from "../data/vehicles";
import { PROCEDURE_REFERENCES } from "../data/procedures";
import { extractProcedureFacts } from "./procedure-extractor";
import { buildProcedurePartsGraph } from "./parts-graph";
describe("procedure parts graph",()=>{
  it("connects the owned vehicle to procedure parts, OEM numbers and actual vendor quotes",()=>{
    const html="<html><body><h1>Water Pump Replacement</h1><p>Remove and replace the water pump.</p><table><tr><th>Part Name</th><th>Manufacturer</th><th>OEM Part Number</th></tr><tr><td>Water Pump</td><td>Toyota</td><td>16100-29157</td></tr></table></body></html>";
    const source="manuals/scion-service-manual/2006 Scion xB L4-1.5L (1NZ-FE)/pages/6627.html";
    const facts=extractProcedureFacts(html,source);
    const procedure=PROCEDURE_REFERENCES.find(item=>item.id==="scion-water-pump");
    const graph=buildProcedurePartsGraph(OWNED_VEHICLES[0],procedure,facts,[
      {vendor:"MockVendor",partNumber:"16100-29157",price:71.99,currency:"USD",url:"https://vendor.example/pump",checkedAt:"2026-11-17T12:00:00Z",source:"api"}
    ]);
    expect(graph.nodes.some(node=>node.type==="vehicle"&&node.label==="2006 Scion xB")).toBe(true);
    expect(graph.nodes.some(node=>node.type==="oem"&&node.label==="16100-29157")).toBe(true);
    expect(graph.nodes.some(node=>node.type==="price"&&node.label==="71.99 USD")).toBe(true);
    expect(graph.edges.some(edge=>edge.relationship==="has-live-price")).toBe(true);
  });
  it("stores catalog links separately from price quotes",()=>{
    const html="<h1>Water Pump</h1><p>Replace the water pump.</p>";
    const facts=extractProcedureFacts(html,"manuals/scion/pages/6627.html");
    const graph=buildProcedurePartsGraph(OWNED_VEHICLES[0],undefined,facts,[
      {vendor:"RockAuto",partNumber:"16100-29157",currency:"USD",url:"https://www.rockauto.com/en/partsearch/",checkedAt:"2026-11-17T12:00:00Z",source:"catalog-link"}
    ]);
    expect(graph.nodes.some(node=>node.type==="catalog-link")).toBe(true);
    expect(graph.nodes.some(node=>node.type==="price")).toBe(false);
  });
});