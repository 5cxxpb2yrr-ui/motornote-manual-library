import { render, screen } from "@testing-library/react";
import PartsSheet from "./PartsSheet";
describe("PartsSheet",()=>{
  it("shows OEM evidence as unverified and distinguishes an undated source price",()=>{
    render(<PartsSheet open={true} onOpenChange={()=>undefined} onAdd={()=>undefined} onAddDetected={()=>undefined} detected={[]} parts={[{
      partName:"Water Pump",manufacturer:"SCI",partNumber:"161002915683",listedPrice:92.34,
      notes:"Includes gasket",sourcePath:"manuals/scion/pages/1238.html",confidence:0.98,verification:"unverified"
    }]}/>);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Water Pump")).toBeInTheDocument();
    expect(screen.getByText(/undated; not a live quote/)).toBeInTheDocument();
    expect(screen.getByText(/not independently verified/)).toBeInTheDocument();
  });
});