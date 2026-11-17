import type { Vehicle } from "../types";
export default function VehicleSummary({vehicle}:{vehicle:Vehicle}) {
  return <article className="vehicle-summary">
    <h2>{vehicle.year} {vehicle.make} {vehicle.model}</h2>
    <p>{vehicle.engine}{vehicle.drivetrain?" · "+vehicle.drivetrain:""}{vehicle.eyesight?" · EyeSight":""}</p>
  </article>;
}