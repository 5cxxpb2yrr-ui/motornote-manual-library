interface Env { MANUALS: R2Bucket; }

type SummaryManual = {
  id: string;
  make: string;
  file_count: number;
};

type LibrarySummary = {
  generated_at?: string;
  file_count?: number;
  manuals?: SummaryManual[];
};

type VehicleEntry = {
  id: string;
  name: string;
  href: string;
  fileCount: number;
};

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

function folderName(prefix: string): string {
  return prefix.split("/").filter(Boolean).at(-1) || "";
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    // The published corpus currently uses the original factory-site layout:
    // manuals/<manual-id>/<vehicle>/index.html plus pages/, images/, and assets.
    // Discover vehicle roots from R2 prefixes and require the real factory
    // index.html. Do not require section tree.json files that this corpus lacks.
    const summaryObject = await env.MANUALS.get("index/summary.json");
    if (!summaryObject) {
      return Response.json({ error: "R2 manual summary is missing" }, { status: 503 });
    }

    const summary = await summaryObject.json<LibrarySummary>();
    if (!Array.isArray(summary.manuals)) {
      return Response.json({ error: "R2 manual summary is invalid" }, { status: 503 });
    }

    const manuals = await mapLimit(summary.manuals, 4, async manual => {
      if (!manual?.id || !/^[a-z0-9][a-z0-9-]*$/i.test(manual.id)) return null;

      const manualPrefix = `manuals/${manual.id}/`;
      const listing = await env.MANUALS.list({
        prefix: manualPrefix,
        delimiter: "/",
        limit: 1000
      });
      const vehiclePrefixes = (listing.delimitedPrefixes || []).filter(prefix =>
        prefix.startsWith(manualPrefix) && prefix !== manualPrefix
      );

      const vehicles = await mapLimit(vehiclePrefixes, 6, async vehiclePrefix => {
        const indexKey = vehiclePrefix + "index.html";
        const indexObject = await env.MANUALS.head(indexKey);
        if (!indexObject) return null;

        const vehicle: VehicleEntry = {
          id: vehiclePrefix.replace(/\/$/, ""),
          name: folderName(vehiclePrefix),
          href: vehiclePrefix,
          fileCount: Number(manual.file_count) || 0
        };
        return vehicle;
      });

      const validVehicles = vehicles
        .filter((vehicle): vehicle is VehicleEntry => vehicle !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (!validVehicles.length) return null;

      return {
        id: manual.id,
        make: String(manual.make || manual.id.split("-")[0]),
        fileCount: Number(manual.file_count) || 0,
        vehicles: validVehicles
      };
    });

    const validManuals = manuals
      .filter((manual): manual is NonNullable<typeof manual> => manual !== null)
      .sort((a, b) => a.make.localeCompare(b.make) || a.id.localeCompare(b.id));

    return Response.json({
      generatedAt: summary.generated_at || new Date().toISOString(),
      manualCount: validManuals.length,
      vehicleCount: validManuals.reduce((total, manual) => total + manual.vehicles.length, 0),
      fileCount: Number(summary.file_count) || validManuals.reduce(
        (total, manual) => total + manual.fileCount, 0
      ),
      manuals: validManuals
    }, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return Response.json({
      error: "Unable to discover factory manuals in R2",
      detail: error instanceof Error ? error.message : "Unknown error"
    }, { status: 503 });
  }
};
