import * as Dialog from "@radix-ui/react-dialog";
import { ShoppingCart, X } from "lucide-react";
import type { ExtractedOemRow } from "../lib/oem";
import type { DetectedPart } from "../lib/extraction";
interface Props { open:boolean; onOpenChange:(open:boolean)=>void; parts:ExtractedOemRow[]; detected:DetectedPart[]; onAdd:(part:ExtractedOemRow)=>void; onAddDetected:(part:DetectedPart)=>void; }
export default function PartsSheet({open,onOpenChange,parts,detected,onAdd,onAddDetected}:Props) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay"/>
      <Dialog.Content className="parts-sheet">
        <header className="dialog-head"><div><p className="eyebrow">SOURCE-EXTRACTED PARTS</p><Dialog.Title>Parts listed in this manual page</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close parts"><X/></Dialog.Close></header>
        <p className="parts-caveat">These values are transcribed from the cited manual page. OEM fitment and any listed price remain unverified until checked against an authoritative catalog or current vendor source.</p>
        {parts.length>0&&<section className="parts-group"><h3>OEM table rows</h3>{parts.map((part,index)=><article className="part-row" key={part.sourcePath+part.partNumber+index}>
          <div><b>{part.partName}</b><small>{part.manufacturer||"Manufacturer not stated"} · OEM label: {part.partNumber}</small>
            <small>Source-listed price: {part.listedPrice==null?"Not listed":"$"+part.listedPrice.toFixed(2)+" (undated; not a live quote)"}</small>
            {part.notes&&<small>{part.notes}</small>}
            <small>Confidence {Math.round(part.confidence*100)}% · not independently verified · {part.sourcePath.split("/").pop()}</small>
          </div>
          <button onClick={()=>onAdd(part)}><ShoppingCart size={15}/> Add</button>
        </article>)}</section>}
        {detected.length>0&&<section className="parts-group"><h3>Parts detected in procedure text</h3>{detected.map((part,index)=><article className="part-row" key={part.part+index}>
          <div><b>{part.part.replace(/-/g," ")}</b><small>{part.relationship||"Relationship not established"} · {Math.round(part.confidence*100)}% extraction confidence</small>
            {part.evidence[0]&&<small>Evidence: “{part.evidence[0].quote}”</small>}
            <small>No OEM fitment or price is implied by this text match.</small>
          </div>
          <button disabled={!part.relationship} onClick={()=>onAddDetected(part)}><ShoppingCart size={15}/> Add</button>
        </article>)}</section>}
        {!parts.length&&!detected.length&&<p className="empty">No OEM parts table or recognized part mentions were found on this page.</p>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}