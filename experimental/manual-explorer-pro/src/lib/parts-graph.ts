import type { Vehicle } from "../types";
import type { ProcedureReference } from "../data/procedures";
import type { ProcedureFacts } from "./procedure-extractor";
import type { VendorPrice } from "./pricing";
export type PartsGraphNodeType="vehicle"|"manual"|"procedure"|"part"|"oem"|"vendor"|"price"|"catalog-link";
export interface PartsGraphNode {
  id:string; type:PartsGraphNodeType; label:string; sourcePath?:string;
  confidence?:number; attributes:Record<string,unknown>;
}
export interface PartsGraphEdge {from:string;to:string;relationship:string;}
export interface ProcedurePartsGraph {
  vehicleId:string; procedureId:string; generatedAt:string;
  nodes:PartsGraphNode[]; edges:PartsGraphEdge[];
}
function slug(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}
export function buildProcedurePartsGraph(vehicle:Vehicle,procedure:ProcedureReference|undefined,facts:ProcedureFacts,vendorResults:VendorPrice[]=[]):ProcedurePartsGraph {
  const vehicleId="vehicle:"+vehicle.id;
  const manualId="manual:"+vehicle.id;
  const procedureId="procedure:"+(procedure?.id||slug(facts.sourcePath));
  const nodes:PartsGraphNode[]=[
    {id:vehicleId,type:"vehicle",label:vehicle.year+" "+vehicle.make+" "+vehicle.model,attributes:{engine:vehicle.engine,drivetrain:vehicle.drivetrain||null,eyesight:vehicle.eyesight||false}},
    {id:manualId,type:"manual",label:vehicle.make+" factory service manual",attributes:{root:vehicle.manualRoot}},
    {id:procedureId,type:"procedure",label:procedure?.title||facts.sourcePath.split("/").pop()||"Factory procedure",sourcePath:facts.sourcePath,attributes:{requiresCalibration:facts.requiresCalibration,variantMismatch:facts.variantMismatch}}
  ];
  const edges:PartsGraphEdge[]=[
    {from:vehicleId,to:manualId,relationship:"has-manual"},
    {from:manualId,to:procedureId,relationship:"contains-procedure"}
  ];
  const partIds=new Map<string,string>();
  for(const part of facts.detectedParts) {
    const id="part:"+part.part;
    partIds.set(slug(part.part),id);
    nodes.push({id,type:"part",label:part.part.replace(/-/g," "),sourcePath:facts.sourcePath,confidence:part.confidence,attributes:{relationship:part.relationship||"mentioned",evidence:part.evidence}});
    edges.push({from:procedureId,to:id,relationship:part.relationship||"mentions"});
  }
  for(const row of facts.oemRows) {
    const partSlug=slug(row.partName);
    let partId=partIds.get(partSlug);
    if(!partId) {
      partId="part:"+partSlug;
      nodes.push({id:partId,type:"part",label:row.partName,sourcePath:row.sourcePath,confidence:row.confidence,attributes:{relationship:"unclassified"}});
      edges.push({from:procedureId,to:partId,relationship:"lists-part"});
      partIds.set(partSlug,partId);
    }
    const oemId="oem:"+slug(row.manufacturer||"unknown")+":"+slug(row.partNumber);
    nodes.push({id:oemId,type:"oem",label:row.partNumber,sourcePath:row.sourcePath,confidence:row.confidence,attributes:{manufacturer:row.manufacturer,listedPrice:row.listedPrice,verification:"unverified",notes:row.notes}});
    edges.push({from:partId,to:oemId,relationship:"has-oem-number"});
  }
  for(const quote of vendorResults) {
    const partId=[...partIds.entries()].find(([key])=>key===slug(quote.partNumber))?.[1];
    const oemId=nodes.find(node=>node.type==="oem"&&node.label===quote.partNumber)?.id;
    const parent=oemId||partId||procedureId;
    const vendorId="vendor:"+slug(quote.vendor);
    if(!nodes.some(node=>node.id===vendorId))nodes.push({id:vendorId,type:"vendor",label:quote.vendor,attributes:{}});
    if(quote.source==="api"&&typeof quote.price==="number") {
      const priceId="price:"+slug(quote.vendor)+":"+slug(quote.partNumber)+":"+slug(quote.checkedAt);
      nodes.push({id:priceId,type:"price",label:quote.price+" "+quote.currency,attributes:{price:quote.price,currency:quote.currency,availability:quote.availability,checkedAt:quote.checkedAt}});
      edges.push({from:parent,to:priceId,relationship:"has-live-price"});
      edges.push({from:priceId,to:vendorId,relationship:"quoted-by"});
    } else {
      const linkId="catalog-link:"+slug(quote.vendor)+":"+slug(quote.partNumber);
      nodes.push({id:linkId,type:"catalog-link",label:quote.vendor+" catalog",attributes:{url:quote.url,partNumber:quote.partNumber}});
      edges.push({from:parent,to:linkId,relationship:"catalog-search"});
      edges.push({from:linkId,to:vendorId,relationship:"opens-vendor"});
    }
  }
  return {vehicleId:vehicle.id,procedureId:procedure?.id||procedureId,generatedAt:new Date().toISOString(),nodes,edges};
}