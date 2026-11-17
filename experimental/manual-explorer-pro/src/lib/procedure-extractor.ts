import { detectParts, type DetectedPart } from "./extraction";
import { extractOemRows, type ExtractedOemRow } from "./oem";
export interface TorqueFact { value:string; evidence:string; confidence:number; }
export interface WarningFact { type:"warning"|"caution"|"note"; text:string; }
export interface ProcedureFacts {
  sourcePath:string; steps:string[]; torqueSpecs:TorqueFact[]; warnings:WarningFact[];
  tools:string[]; consumables:string[]; detectedParts:DetectedPart[];
  oemRows:ExtractedOemRow[]; variantMismatch:boolean; requiresCalibration:boolean;
}
const TOOL_TERMS=["Subaru Select Monitor","SST","special service tool","radiator cap tester","torque wrench","16 mm plug wrench","plumb bob","RANDOM CHART","pulley holder","dial indicator"];
const CONSUMABLE_TERMS=["engine coolant","Toyota Super Long Life Coolant","coolant","engine oil","sealant","grease","brake fluid","refrigerant","washer fluid","thread locking compound"];
function uniqueMatches(text:string,terms:string[]) {
  const lower=text.toLowerCase();
  return terms.filter(term=>lower.includes(term.toLowerCase()));
}
export function extractProcedureFacts(html:string,sourcePath:string):ProcedureFacts {
  const doc=new DOMParser().parseFromString(html,"text/html");
  const title=doc.querySelector("h1")?.textContent?.trim()||doc.title||sourcePath.split("/").pop()||"Manual procedure";
  const body=doc.body?.textContent||"";
  const normalized=body.replace(/\s+/g," ").trim();
  const stepNodes=[...doc.querySelectorAll("ol.ARABICNUM > li, ol.steps > li")];
  const fallbackSteps=stepNodes.length?stepNodes:[...doc.querySelectorAll("ol > li")];
  const steps=fallbackSteps.map(node=>node.textContent?.replace(/\s+/g," ").trim()||"").filter(Boolean);
  const warnings:WarningFact[]=[...doc.querySelectorAll(".WARNING,.CAUTION,.NOTE")].map(node=>{
    const classes=(node.getAttribute("class")||"").toLowerCase();
    const type:WarningFact["type"]=classes.includes("warning")?"warning":classes.includes("caution")?"caution":"note";
    return {type,text:node.textContent?.replace(/\s+/g," ").trim()||""};
  }).filter(item=>item.text);
  const torqueSpecs:TorqueFact[]=[];
  const lines=[...doc.querySelectorAll("p,li,td,th,div")].map(node=>node.textContent?.replace(/\s+/g," ").trim()||"").filter(Boolean);
  for(let index=0;index<lines.length;index++) {
    const line=lines[index];
    const inline=line.match(/(?:tightening\s+)?torque\s*:\s*(.+)/i);
    if(inline?.[1])torqueSpecs.push({value:inline[1].trim(),evidence:line,confidence:0.97});
    else if(/^(?:tightening\s+)?torque\s*:?\s*$/i.test(line)&&lines[index+1])torqueSpecs.push({value:lines[index+1],evidence:line+" "+lines[index+1],confidence:0.95});
  }
  const regex=/(?:tightening\s+)?torque\s*:\s*([0-9][^.;]{0,100}(?:N\.m|Nm|ft-lb|kgf-m)[^.;]*)/gi;
  for(const match of normalized.matchAll(regex)) {
    const value=match[1].trim();
    if(!torqueSpecs.some(item=>item.value===value))torqueSpecs.push({value,evidence:match[0],confidence:0.9});
  }
  const variantMismatch=/different variant\/trim than selected/i.test(normalized);
  const requiresCalibration=/eyesight|stereo camera/i.test(title+" "+normalized)&&/calibrat|initializ|camera adjustment/i.test(title+" "+normalized);
  return {
    sourcePath,steps,torqueSpecs,warnings,
    tools:uniqueMatches(normalized,TOOL_TERMS),
    consumables:uniqueMatches(normalized,CONSUMABLE_TERMS),
    detectedParts:detectParts(sourcePath,title,normalized),
    oemRows:extractOemRows(html,sourcePath),
    variantMismatch,requiresCalibration
  };
}