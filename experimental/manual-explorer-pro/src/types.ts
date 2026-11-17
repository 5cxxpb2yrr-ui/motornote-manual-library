export type RelationshipType = "required" | "recommended" | "consumable" | "tool";
export interface Vehicle {
  id: "2006-scion-xb" | "2019-subaru-crosstrek-limited";
  year: number; make: "Scion" | "Subaru"; model: string; engine: string;
  drivetrain?: string; eyesight?: boolean; owned: true;
  manualRoot: string; indexKey: string; treeKeys: string[];
}
export interface TreeNode { n?: string; title?: string; p?: number | string; file?: string; c?: TreeNode[]; }
export interface ManualLink { title: string; key: string; pageNumber: number; section: string; }
export interface SearchRecord { title: string; path: string; text: string; manualId?: string; vehicleId?: Vehicle["id"]; }
export interface Part {
  id: string; name: string; category: string;
  oem: Array<{ manufacturer: string; partNumber: string; sourceUrl?: string }>;
  relatedParts: string[]; verification: "verified" | "unverified";
}
export interface PartRelationship {
  procedureId: string; partId: string; relationship: RelationshipType; confidence: number;
  evidence: Array<{ sourcePath: string; quote: string }>;
}
export interface RepairCartLine {
  id: string; name: string; quantity: number; relationship: RelationshipType;
  oem?: string; vendor?: string; price?: number; url?: string;
  sourcePath?: string; confidence?: number; verification?: "unverified" | "verified";
}
export interface RepairCart { vehicleId: Vehicle["id"]; procedureId: string; parts: RepairCartLine[]; tools: RepairCartLine[]; }
export interface CartValidation { valid: boolean; warnings: string[]; errors: string[]; }