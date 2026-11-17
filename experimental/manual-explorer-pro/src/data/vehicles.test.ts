import { OWNED_VEHICLES } from "./vehicles";
describe("owned vehicle seed", () => {
  it("contains only the two specified vehicles", () => {
    expect(OWNED_VEHICLES.map(vehicle => vehicle.id)).toEqual(["2006-scion-xb","2019-subaru-crosstrek-limited"]);
    expect(OWNED_VEHICLES.every(vehicle => vehicle.owned)).toBe(true);
    expect(JSON.stringify(OWNED_VEHICLES).toLowerCase()).not.toMatch(/tacoma|f-?150|ford/);
  });
});