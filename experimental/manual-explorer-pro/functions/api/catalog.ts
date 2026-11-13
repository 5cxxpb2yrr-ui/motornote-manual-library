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

type TreeFile = { title: string; key: string; fileCount: number };

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

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
    // Read the directory levels concurrently. The previous implementation
    // walked every R2 prefix and tree file serially, leaving the home screen
    // on its loading placeholder for several minutes on larger libraries.
    const root = await env.MANUALS.list({ prefix: "manuals/", delimiter: "/", limit: 1000 });
    const manualPrefixes = (root.delimitedPrefixes || []).filter(prefix =>
      /^manuals\/[^/]+\/$/.test(prefix)
    );

    const manuals = await mapLimit(manualPrefixes, 4, async manualPrefix => {
      const manualId = folderName(manualPrefix);
      const vehiclesListing = await env.MANUALS.list({
        prefix: manualPrefix, delimiter: "/", limit: 1000
      });
      const vehiclePrefixes = vehiclesListing.delimitedPrefixes || [];

      const vehicles = await mapLimit(vehiclePrefixes, 6, async vehiclePrefix => {
        const modelListing = await env.MANUALS.list({
          prefix: vehiclePrefix, delimiter: "/", limit: 1000
        });
        const modelPrefixes = modelListing.delimitedPrefixes || [];

        const modelResults = await mapLimit(modelPrefixes, 6, async modelPrefix => {
          const sectionListing = await env.MANUALS.list({
            prefix: modelPrefix, delimiter: "/", limit: 1000
          });
          const sectionPrefixes = sectionListing.delimitedPrefixes || [];

          return mapLimit(sectionPrefixes, 8, async sectionPrefix => {
            const sectionObjects = await env.MANUALS.list({
              prefix: sectionPrefix, delimiter: "/", limit: 1000
            });
            const treeKeys = (sectionObjects.objects || [])
              .map(object => object.key)
              .filter(key => /-tree\.json$/i.test(key));

            return mapLimit(treeKeys, 8, async key => {
              const object = await env.MANUALS.get(key);
              if (!object) return null;
              try {
                const tree = await object.json<TreeNode>();
                return {
                  title: tree.title || folderName(sectionPrefix),
                  key,
                  fileCount: countFiles(tree)
                } satisfies TreeFile;
              } catch {
                return null;
              }
            });
          });
        });

        const treeFiles = modelResults.flat(2).filter((tree): tree is TreeFile => tree !== null);
        if (!treeFiles.length) return null;
        treeFiles.sort((a, b) => a.title.localeCompare(b.title));

        const matchingModelPrefix = modelPrefixes.find(prefix =>
          treeFiles.some(tree => tree.key.startsWith(prefix))
        );
        const vehicleName = folderName(matchingModelPrefix || vehiclePrefix);
        const make = vehicleName.match(/^\d{4}\s+([^\s]+)/)?.[1] || manualId.split("-")[0];
        const fileCount = treeFiles.reduce((total, tree) => total + tree.fileCount, 0);

        return {
          id: vehiclePrefix.replace(/\/$/, ""),
          name: vehicleName,
          href: vehiclePrefix,
          fileCount,
          treeFiles,
          make
        };
      });

      const validVehicles = vehicles.filter((vehicle): vehicle is NonNullable<typeof vehicle> => vehicle !== null);
      if (!validVehicles.length) return null;
      const make = validVehicles[0].make;
      return {
        id: manualId,
        make,
        fileCount: validVehicles.reduce((total, vehicle) => total + vehicle.fileCount, 0),
        vehicles: validVehicles.map(({ make: _make, ...vehicle }) => vehicle)
      };
    });

    const sortedManuals = manuals
      .filter((manual): manual is NonNullable<typeof manual> => manual !== null)
      .sort((a, b) => a.make.localeCompare(b.make) || a.id.localeCompare(b.id));
    for (const manual of sortedManuals) {
      manual.vehicles.sort((a, b) => a.name.localeCompare(b.name));
    }

    return Response.json({
      generatedAt: new Date().toISOString(),
      manualCount: sortedManuals.length,
      vehicleCount: sortedManuals.reduce((total, manual) => total + manual.vehicles.length, 0),
      fileCount: sortedManuals.reduce((total, manual) => total + manual.fileCount, 0),
      manuals: sortedManuals
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
