import { confidenceBand, detectParts } from "./extraction";
describe("manual part extraction", () => {
  it("keeps evidence and confidence tied to source text", () => {
    const results = detectParts("manuals/scion/pages/44.html","Water Pump Replacement","Remove the water pump and install a new water pump gasket.");
    expect(results[0].part).toBe("water-pump");
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(results[0].evidence[0].sourcePath).toContain("pages/44.html");
    expect(results[0].relationship).toBe("required");
  });
  it("classifies confidence bands", () => {
    expect(confidenceBand(0.95)).toBe("high");
    expect(confidenceBand(0.8)).toBe("medium");
    expect(confidenceBand(0.3)).toBe("low");
  });
});