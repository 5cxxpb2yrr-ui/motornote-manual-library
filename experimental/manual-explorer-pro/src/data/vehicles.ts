import type { Vehicle } from "../types";
export const OWNED_VEHICLES: Vehicle[] = [
  {
    id: "2006-scion-xb", year: 2006, make: "Scion", model: "xB", engine: "1NZ-FE", owned: true,
    manualRoot: "manuals/scion-service-manual/2006 Scion xB L4-1.5L (1NZ-FE)/",
    indexKey: "manuals/scion-service-manual/2006 Scion xB L4-1.5L (1NZ-FE)/index.html", treeKeys: []
  },
  {
    id: "2019-subaru-crosstrek-limited", year: 2019, make: "Subaru", model: "Crosstrek Limited",
    engine: "FB20D", drivetrain: "AWD", eyesight: true, owned: true,
    manualRoot: "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/",
    indexKey: "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/index.html",
    treeKeys: [
      "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/2019 Subaru Crosstrek/Repair and Diagnosis/Subaru-repairanddiagnosis-tree.json",
      "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/2019 Subaru Crosstrek/Labor Times/Subaru-labortimes-tree.json"
    ]
  }
];
export function isOwnedVehicleId(value: string): value is Vehicle["id"] {
  return OWNED_VEHICLES.some(vehicle => vehicle.id === value);
}