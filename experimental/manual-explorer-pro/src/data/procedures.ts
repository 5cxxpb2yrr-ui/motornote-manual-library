import type { VehicleId } from "./vehicles";
export type ProcedureSystem =
  | "Engine" | "Cooling" | "Fuel" | "Electrical" | "Brakes"
  | "Transmission/CVT" | "Suspension" | "HVAC" | "Diagnostics" | "EyeSight";
export interface ProcedureReference {
  id:string; vehicleId:VehicleId; system:ProcedureSystem; title:string;
  sourcePages:string[]; relatedPages?:string[]; requiresCalibration?:boolean;
  applicability:"vehicle-specific"|"confirm-trim";
  status:"source-linked";
}
export const PROCEDURE_REFERENCES:ProcedureReference[] = [
  {id:"scion-oil-filter",vehicleId:"2006-scion-xb",system:"Engine",title:"Oil Filter — Service and Repair",sourcePages:["pages/6674.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-water-pump",vehicleId:"2006-scion-xb",system:"Cooling",title:"Water Pump — Service and Repair",sourcePages:["pages/6627.html"],relatedPages:["pages/1296.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-cooling-inspection",vehicleId:"2006-scion-xb",system:"Cooling",title:"Cooling System — On-Vehicle Inspection",sourcePages:["pages/1855.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-fuel-injector",vehicleId:"2006-scion-xb",system:"Fuel",title:"Fuel Injector — Service and Repair",sourcePages:["pages/6091.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-starter-motor",vehicleId:"2006-scion-xb",system:"Electrical",title:"Starter Motor — Testing and Inspection",sourcePages:["pages/5624.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-alternator",vehicleId:"2006-scion-xb",system:"Electrical",title:"Alternator — Testing and Inspection",sourcePages:["pages/5661.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-brake-pad",vehicleId:"2006-scion-xb",system:"Brakes",title:"Disc Brake Pad — Specifications",sourcePages:["pages/5776.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-transmission-control",vehicleId:"2006-scion-xb",system:"Transmission/CVT",title:"Transmission Control Systems — Description",sourcePages:["pages/3960.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-wheel-bearing",vehicleId:"2006-scion-xb",system:"Suspension",title:"Front Axle Hub Bearing — Testing and Inspection",sourcePages:["pages/6752.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-ac-precautions",vehicleId:"2006-scion-xb",system:"HVAC",title:"Air Conditioning — Service Precautions",sourcePages:["pages/2866.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-dtc-chart",vehicleId:"2006-scion-xb",system:"Diagnostics",title:"Diagnostic Trouble Code Chart",sourcePages:["pages/4350.html"],applicability:"vehicle-specific",status:"source-linked"},
  {id:"scion-spark-plug",vehicleId:"2006-scion-xb",system:"Engine",title:"Spark Plug — Testing and Inspection",sourcePages:["pages/6892.html"],applicability:"vehicle-specific",status:"source-linked"},

  {id:"subaru-oil-pan",vehicleId:"2019-subaru-crosstrek-limited",system:"Engine",title:"Oil Pan — Service and Repair",sourcePages:["pages/15345.html"],applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-radiator",vehicleId:"2019-subaru-crosstrek-limited",system:"Cooling",title:"Radiator — Service and Repair",sourcePages:["pages/15533.html"],applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-fuel-injector",vehicleId:"2019-subaru-crosstrek-limited",system:"Fuel",title:"Fuel Injector — Service and Repair",sourcePages:["pages/15852.html"],applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-battery",vehicleId:"2019-subaru-crosstrek-limited",system:"Electrical",title:"Battery — Service and Repair",sourcePages:["pages/15314.html"],applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-brake-pad",vehicleId:"2019-subaru-crosstrek-limited",system:"Brakes",title:"Disc Brake Pad and Disc — Inspection",sourcePages:["pages/11978.html","pages/10640.html"],applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-cvt-diagnosis",vehicleId:"2019-subaru-crosstrek-limited",system:"Transmission/CVT",title:"CVT Model — Outline of Diagnosis",sourcePages:["pages/10104.html"],applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-front-axle",vehicleId:"2019-subaru-crosstrek-limited",system:"Suspension",title:"Front Axle — Service and Repair",sourcePages:["pages/15182.html"],applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-ac-precautions",vehicleId:"2019-subaru-crosstrek-limited",system:"HVAC",title:"Air Conditioning — Service Precautions",sourcePages:["pages/1385.html"],applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-eye-camera-removal",vehicleId:"2019-subaru-crosstrek-limited",system:"EyeSight",title:"Stereo Camera — Removal",sourcePages:["pages/1193.html"],requiresCalibration:true,applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-eye-camera-adjustment",vehicleId:"2019-subaru-crosstrek-limited",system:"EyeSight",title:"Stereo Camera — Adjustment and Inspection",sourcePages:["pages/1195.html","pages/1196.html","pages/1201.html"],requiresCalibration:true,applicability:"confirm-trim",status:"source-linked"},
  {id:"subaru-eye-camera-initialization",vehicleId:"2019-subaru-crosstrek-limited",system:"EyeSight",title:"Stereo Camera — Initialization",sourcePages:["pages/1202.html"],requiresCalibration:true,applicability:"confirm-trim",status:"source-linked"}
];
export function proceduresForVehicle(vehicleId:VehicleId) {
  return PROCEDURE_REFERENCES.filter(procedure=>procedure.vehicleId===vehicleId);
}