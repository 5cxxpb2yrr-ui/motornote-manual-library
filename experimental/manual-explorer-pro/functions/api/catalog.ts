interface Env { MANUALS: R2Bucket; }

type TreeNode = {
  file?: string;
  filename?: string;
  fileName?: string;
  c?: TreeNode[];
  children?: TreeNode[];
  sections?: TreeNode[];
};

function childrenOf(node: TreeNode | TreeNode[]): TreeNode[] {
  if (Array.isArray(node)) return node;
  return node.c || node.children || node.sections || [];
}

function countFiles(node: TreeNode | TreeNode[]): number {
  if (Array.isArray(node)) return node.reduce((total, child) => total + countFiles(child), 0);
  const children = childrenOf(node);
  const ownFile = [node.file, node.filename, node.fileName].some(value => typeof value === "string" && value.length > 0) ? 1 : 0;
  return ownFile + children.reduce((total, child) => total + countFiles(child), 0);
}

function makeFromVehicleName(name: string): string {
  const match = name.match(/^\d{4}\s+([^\s]+)/);
  return match?.[1] || name.split(/\s+/)[0] || "Vehicle";
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    // The live corpus is stored under manuals/{manual-slug}/{vehicle}/.
    // Only a vehicle folder with its own tree.json is a published catalog entry.
    const root = await env.MANUALS.list({ prefix: "manuals/", delimiter: "/", limit: 1000 });
    const manualPrefixes = (root.delimitedPrefixes || []).filter(prefix =>
      /^manuals\/[^/]+\/$/.test(prefix)
    );
    const manualsById = new Map<string, {
      id: string;
      make: string;
      fileCount: number;
      vehicles: Array<{ id: string; name: string; href: string; fileCount: number }>;
    }>();

    for (const manualPrefix of manualPrefixes) {
      const manualId = manualPrefix.split("/").filter(Boolean).at(-1) || "manual";
      const vehiclesListing = await env.MANUALS.list({
        prefix: manualPrefix,
        delimiter: "/",
        limit: 1000
      });

      for (const vehiclePrefix of vehiclesListing.delimitedPrefixes || []) {
        const vehicleName = vehiclePrefix.slice(manualPrefix.length).replace(/\/$/, "");
        if (!vehicleName) continue;

        const treeObject = await env.MANUALS.get(vehiclePrefix + "tree.json");
        if (!treeObject) continue;

        let fileCount = 0;
        try {
          const tree = await treeObject.json<TreeNode>();
          fileCount = countFiles(tree);
        } catch {
          // Keep the vehicle visible so a malformed tree can be diagnosed in the reader.
        }

        let manual = manualsById.get(manualId);
        if (!manual) {
          manual = {
            id: manualId,
            make: makeFromVehicleName(vehicleName),
            fileCount: 0,
            vehicles: []
          };
          manualsById.set(manualId, manual);
        }

        manual.fileCount += fileCount;
        manual.vehicles.push({
          id: vehiclePrefix.replace(/\/$/, ""),
          name: vehicleName,
          href: vehiclePrefix,
          fileCount
        });
      }
    }

    const manuals = [...manualsById.values()]
      .filter(manual => manual.vehicles.length > 0)
      .sort((a, b) => a.make.localeCompare(b.make) || a.id.localeCompare(b.id));

    for (const manual of manuals) {
      manual.vehicles.sort((a, b) => a.name.localeCompare(b.name));
    }

    const fileCount = manuals.reduce((total, manual) => total + manual.fileCount, 0);
    return Response.json({
      generatedAt: new Date().toISOString(),
      manualCount: manuals.length,
      vehicleCount: manuals.reduce((total, manual) => total + manual.vehicles.length, 0),
      fileCount,
      manuals
    }, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return Response.json({
      error: "Unable to read the R2 tree catalog",
      detail: error instanceof Error ? error.message : "Unknown error"
    }, { status: 503 });
  }
};
