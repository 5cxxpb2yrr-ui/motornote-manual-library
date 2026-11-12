interface Env { MANUALS: R2Bucket; }

type TreeNode = {
  title?: string;
  p?: number | string;
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
  const pageNumber = Number(node.p);
  const hasPage = Number.isInteger(pageNumber) && pageNumber > 0;
  const ownFile = hasPage || [node.file, node.filename, node.fileName].some(
    value => typeof value === "string" && value.length > 0
  ) ? 1 : 0;
  return ownFile + children.reduce((total, child) => total + countFiles(child), 0);
}

function folderName(prefix: string): string {
  return prefix.split("/").filter(Boolean).at(-1) || "";
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const root = await env.MANUALS.list({ prefix: "manuals/", delimiter: "/", limit: 1000 });
    const manualPrefixes = (root.delimitedPrefixes || []).filter(prefix =>
      /^manuals\/[^/]+\/$/.test(prefix)
    );

    const manualsById = new Map<string, {
      id: string;
      make: string;
      fileCount: number;
      vehicles: Array<{
        id: string;
        name: string;
        href: string;
        fileCount: number;
        treeFiles: Array<{ title: string; key: string; fileCount: number }>;
      }>;
    }>();

    for (const manualPrefix of manualPrefixes) {
      const manualId = folderName(manualPrefix);
      const vehiclesListing = await env.MANUALS.list({
        prefix: manualPrefix,
        delimiter: "/",
        limit: 1000
      });

      for (const vehiclePrefix of vehiclesListing.delimitedPrefixes || []) {
        const modelListing = await env.MANUALS.list({
          prefix: vehiclePrefix,
          delimiter: "/",
          limit: 1000
        });

        const treeFiles: Array<{ title: string; key: string; fileCount: number }> = [];
        for (const modelPrefix of modelListing.delimitedPrefixes || []) {
          const sectionListing = await env.MANUALS.list({
            prefix: modelPrefix,
            delimiter: "/",
            limit: 1000
          });

          for (const sectionPrefix of sectionListing.delimitedPrefixes || []) {
            const sectionObjects = await env.MANUALS.list({
              prefix: sectionPrefix,
              delimiter: "/",
              limit: 1000
            });
            const treeKeys = (sectionObjects.objects || [])
              .map(object => object.key)
              .filter(key => /-tree\.json$/i.test(key));

            for (const key of treeKeys) {
              const object = await env.MANUALS.get(key);
              if (!object) continue;
              try {
                const tree = await object.json<TreeNode>();
                treeFiles.push({
                  title: tree.title || folderName(sectionPrefix),
                  key,
                  fileCount: countFiles(tree)
                });
              } catch {
                // Ignore unreadable tree files; valid trees remain available.
              }
            }
          }
        }

        if (!treeFiles.length) continue;
        treeFiles.sort((a, b) => a.title.localeCompare(b.title));

        const vehicleName = folderName(
          (modelListing.delimitedPrefixes || []).find(prefix =>
            treeFiles.some(tree => tree.key.startsWith(prefix))
          ) || vehiclePrefix
        );
        const make = vehicleName.match(/^\d{4}\s+([^\s]+)/)?.[1] || manualId.split("-")[0];
        let manual = manualsById.get(manualId);
        if (!manual) {
          manual = { id: manualId, make, fileCount: 0, vehicles: [] };
          manualsById.set(manualId, manual);
        }

        const fileCount = treeFiles.reduce((total, tree) => total + tree.fileCount, 0);
        manual.fileCount += fileCount;
        manual.vehicles.push({
          id: vehiclePrefix.replace(/\/$/, ""),
          name: vehicleName,
          href: vehiclePrefix,
          fileCount,
          treeFiles
        });
      }
    }

    const manuals = [...manualsById.values()]
      .filter(manual => manual.vehicles.length > 0)
      .sort((a, b) => a.make.localeCompare(b.make) || a.id.localeCompare(b.id));

    for (const manual of manuals) {
      manual.vehicles.sort((a, b) => a.name.localeCompare(b.name));
    }

    return Response.json({
      generatedAt: new Date().toISOString(),
      manualCount: manuals.length,
      vehicleCount: manuals.reduce((total, manual) => total + manual.vehicles.length, 0),
      fileCount: manuals.reduce((total, manual) => total + manual.fileCount, 0),
      manuals
    }, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return Response.json({
      error: "Unable to read the R2 section-tree catalog",
      detail: error instanceof Error ? error.message : "Unknown error"
    }, { status: 503 });
  }
};
