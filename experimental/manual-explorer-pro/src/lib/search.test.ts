import { parseSearchQuery, searchRecords } from "./search";
describe("manual search", () => {
  it("parses vehicle and section filters", () => {
    expect(parseSearchQuery("water pump vehicle:subaru section:engine")).toEqual({ text: "water pump", vehicle: "subaru", section: "engine" });
  });
  it("requires all terms and ranks title matches first", () => {
    const records = [
      { title: "Water Pump Removal", path: "subaru/pages/1.html", text: "cooling system" },
      { title: "Water Outlet", path: "scion/pages/2.html", text: "water line" },
      { title: "Pump Diagnosis", path: "subaru/pages/3.html", text: "water pump cooling" }
    ];
    expect(searchRecords(records, "water pump").map(item => item.title)).toEqual(["Water Pump Removal","Pump Diagnosis"]);
  });
});