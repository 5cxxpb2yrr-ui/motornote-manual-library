import { extractOemRows } from "./oem";
describe("OEM table extraction", () => {
  it("preserves the exact source part number and does not mark it verified", () => {
    const html = "<table><thead><tr><td>Part</td><td>Manufacturer</td><td>OEM Part #</td><td>Price</td><td>Notes</td></tr></thead><tr><td>Water Pump</td><td>SCI</td><td>161002915683</td><td>92.34</td><td>Includes gasket</td></tr></table>";
    expect(extractOemRows(html,"manuals/scion/pages/1238.html")).toEqual([{
      partName:"Water Pump",manufacturer:"SCI",partNumber:"161002915683",listedPrice:92.34,
      notes:"Includes gasket",sourcePath:"manuals/scion/pages/1238.html",confidence:0.98,verification:"unverified"
    }]);
  });
});