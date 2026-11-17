import { PROCEDURE_REFERENCES } from "./procedures";
describe("source-linked procedure seed allowlist",()=>{
  it("contains procedures only for the two owned vehicles",()=>{
    const ids=[...new Set(PROCEDURE_REFERENCES.map(item=>item.vehicleId))].sort();
    expect(ids).toEqual(["2006-scion-xb","2019-subaru-crosstrek-limited"]);
    expect(JSON.stringify(PROCEDURE_REFERENCES)).not.toMatch(/Tacoma|F150|Ford/i);
  });
  it("marks EyeSight camera procedures as calibration-sensitive",()=>{
    const camera=PROCEDURE_REFERENCES.filter(item=>item.system==="EyeSight"&&item.title.toLowerCase().includes("camera"));
    expect(camera.length).toBeGreaterThan(0);
    expect(camera.every(item=>item.requiresCalibration)).toBe(true);
  });
});