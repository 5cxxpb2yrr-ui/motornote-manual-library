import { renderToStaticMarkup } from "react-dom/server";
import { OWNED_VEHICLES } from "../data/vehicles";
import VehicleSummary from "./VehicleSummary";
describe("VehicleSummary visual snapshot",()=>{
  it("renders the Scion vehicle card with its exact engine",()=>{
    const markup=renderToStaticMarkup(<VehicleSummary vehicle={OWNED_VEHICLES[0]}/>);
    expect(markup).toMatchInlineSnapshot('"<article class="vehicle-summary"><h2>2006 Scion xB</h2><p>1NZ-FE</p></article>"');
  });
});