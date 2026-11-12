interface Env { MANUALS: R2Bucket; }

type TreeNode = {
  file?: string;
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
  if (children.length) return children.reduce((total, child) => total + countFiles(child), 0);
  return [node.file, (node as any).filename, (node as any).fileName].some(value => typeof value === "string" && value.length > 0) ? 1 : 0;
}

function makeFromVehicleName(name: string): string {
  const match = name.match(/^\d{4}\s+([^\s]+)/);
  return match?.[1] || name.split(/\s+/)[0] || "Vehicle";
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const root = await env.MANUALS.list({ delimiter: "/", limit: 1000 });
    const vehiclePrefixes = (root.delimitedPrefixes || []).filter(prefix => /^\d{4}\s/.test(prefix.replace(/\/$/, "")));
    const manuals = [];

    for (const vehiclePrefix of vehiclePrefixes) {
      const vehicleName = vehiclePrefix.replace(/\\/$/, "");
      const manualListing = await env.MANUALS.list({
        prefix: vehiclePrefix,
        delimiter: "/",
        limit: 1000
      });

      for (const manualPrefix of manualListing.delimitedPrefixes || []) {
        const manualName = manualPrefix.slice(vehiclePrefix.length).replace(/\\/$/, "");
        const treeObject = await env.MANUALS.get(manualPrefix + "tree.json");
        let fileCount = 0;
        if (treeObject) {
          try {
            const tree = await treeObject.json<TreeNode>();
            fileCount = countFiles(tree);
          } catch {
            fileCount = 0;
          }
        }

        const vehicleId = manualPrefix.replace(/\\/$/, "");
        manuals.push({
          id: manualName,
          make: makeFromVehicleName(vehicleName),
          fileCount,
          vehicles: [{
            id: vehicleId,
            name: vehicleName,
            href: vehicleId + "/",
            fileCount
          }]
        });
      }
    }

    manuals.sort((a, b) =>
      a.make.localeCompare(b.make) ||
      a.vehicles[0].name.localeCompare(b.vehicles[0].name) ||
      a.id.localeCompare(b.id)
    );

    const fileCount = manuals.reduce((total, manual) => total + manual.fileCount, 0);
    return Response.json({
      generatedAt: new Date().toISOString(),
      manualCount: manuals.length,
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
      error: "Unable to read the section-based R2 manual catalog",
      detail: error instanceof Error ? error.message : "Unknown error"
    }, { status: 503 });
  }
};
