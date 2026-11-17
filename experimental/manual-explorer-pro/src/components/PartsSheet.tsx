import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, ShoppingCart, X } from "lucide-react";
import type { RepairCartLine, RelationshipType } from "../types";

interface Props {
  open: boolean; onOpenChange: (open:boolean)=>void;
  groups: Record<RelationshipType,RepairCartLine[]>;
  onAdd: (line:RepairCartLine)=>void;
}
const labels: RelationshipType[] = ["required","recommended","consumable","tool"];
export default function PartsSheet({open,onOpenChange,groups,onAdd}:Props) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay"/>
      <Dialog.Content className="parts-sheet">
        <header className="dialog-head"><div><p className="eyebrow">PROCEDURE PARTS</p><Dialog.Title>Related parts & tools</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close parts"><X/></Dialog.Close></header>
        {labels.map(group=><section className="parts-group" key={group}><h3>{group}</h3>
          {groups[group].map(line=><article className="part-row" key={line.id}>
            <div><b>{line.name}</b><small>{line.oem ? "OEM "+line.oem : "OEM number not verified"} · {line.vendor && line.price != null ? line.vendor+" · $"+line.price.toFixed(2) : "No verified live price"}</small></div>
            {line.url&&<a href={line.url} target="_blank" rel="noreferrer" aria-label={"Open vendor link for "+line.name}><ExternalLink size={16}/></a>}
            <button onClick={()=>onAdd(line)}><ShoppingCart size={15}/> Add</button>
          </article>)}
          {!groups[group].length&&<p className="empty">No source-backed items identified.</p>}
        </section>)}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}