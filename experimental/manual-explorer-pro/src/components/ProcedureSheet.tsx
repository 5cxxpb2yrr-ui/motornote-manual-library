import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2, Wrench, X } from "lucide-react";
import type { ProcedureFacts } from "../lib/procedure-extractor";
interface Props { open:boolean; onOpenChange:(open:boolean)=>void; facts:ProcedureFacts|null; }
export default function ProcedureSheet({open,onOpenChange,facts}:Props) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay"/>
      <Dialog.Content className="procedure-sheet">
        <header className="dialog-head"><div><p className="eyebrow">FACTORY PROCEDURE EVIDENCE</p><Dialog.Title>Procedure details</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close procedure details"><X/></Dialog.Close></header>
        {!facts&&<p className="empty">Open a factory manual page to extract its procedure details.</p>}
        {facts&&<>
          {facts.variantMismatch&&<div className="variant-warning"><b>Vehicle variant warning</b><span>This page explicitly identifies a different trim. Do not apply it to the selected vehicle without confirming applicability.</span></div>}
          {facts.warnings.length>0&&<section className="fact-section"><h3><AlertTriangle size={16}/> Warnings and notes</h3>{facts.warnings.map((item,index)=><p className={"fact-warning "+item.type} key={index}><b>{item.type.toUpperCase()}</b> {item.text}</p>)}</section>}
          {facts.steps.length>0&&<section className="fact-section"><h3>Procedure steps</h3><ol>{facts.steps.map((step,index)=><li key={index}>{step}</li>)}</ol></section>}
          {facts.torqueSpecs.length>0&&<section className="fact-section"><h3>Torque specifications</h3>{facts.torqueSpecs.map((item,index)=><p className="fact-row" key={index}><b>{item.value}</b><small>{item.evidence} · {Math.round(item.confidence*100)}% extraction confidence</small></p>)}</section>}
          {facts.tools.length>0&&<section className="fact-section"><h3><Wrench size={16}/> Tools mentioned</h3><ul>{facts.tools.map(item=><li key={item}>{item}</li>)}</ul></section>}
          {facts.consumables.length>0&&<section className="fact-section"><h3>Consumables mentioned</h3><ul>{facts.consumables.map(item=><li key={item}>{item}</li>)}</ul></section>}
          {facts.detectedParts.length>0&&<section className="fact-section"><h3>Detected part references</h3>{facts.detectedParts.map(item=><p className="fact-row" key={item.part}><b>{item.part.replace(/-/g," ")}</b><small>{Math.round(item.confidence*100)}% · {item.relationship||"relationship not established by source"}</small></p>)}</section>}
          {facts.oemRows.length>0&&<p className="fact-verified"><CheckCircle2 size={15}/> OEM table rows found: {facts.oemRows.length}. Values remain unverified.</p>}
          <p className="fact-source">Source: {facts.sourcePath}</p>
          {!facts.steps.length&&!facts.torqueSpecs.length&&!facts.warnings.length&&<p className="empty">This page is an index or reference page. Follow its links to the detailed service procedure.</p>}
        </>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}