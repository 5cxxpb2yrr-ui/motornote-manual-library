import { extractProcedureFacts } from "./procedure-extractor";
describe("procedure evidence extraction",()=>{
  it("extracts steps, cautions, torque, tools and consumables",()=>{
    const html="<html><head><title>EyeSight Camera Initialization</title></head><body><h1>EyeSight Camera Initialization</h1><div class='CAUTION'>Do not touch the camera lens.</div><ol class='ARABICNUM'><li>Connect the Subaru Select Monitor.</li></ol><p>Tightening torque:</p><p>5.5±1 N.m</p><p>Use engine coolant.</p></body></html>";
    const facts=extractProcedureFacts(html,"manuals/subaru/pages/1202.html");
    expect(facts.steps[0]).toContain("Subaru Select Monitor");
    expect(facts.warnings[0].type).toBe("caution");
    expect(facts.torqueSpecs[0].value).toBe("5.5±1 N.m");
    expect(facts.tools).toContain("Subaru Select Monitor");
    expect(facts.consumables).toContain("engine coolant");
    expect(facts.requiresCalibration).toBe(true);
  });
  it("flags an explicit variant mismatch",()=>{
    const facts=extractProcedureFacts("<p>WARNING: This page is about the Crosstrek Base, which is a different variant/trim than selected.</p>","manuals/subaru/pages/999.html");
    expect(facts.variantMismatch).toBe(true);
  });
});