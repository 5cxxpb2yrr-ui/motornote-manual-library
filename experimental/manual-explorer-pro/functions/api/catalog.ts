interface Env { MANUALS: R2Bucket; }

interface ManualSummary {
  generated_at?: string;
  manual_count?: number;
  file_count?: number;
  manuals?: Array<{ id: string; make: string; file_count: number }>;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const summaryObject = await env.MANUALS.get("index/summary.json");
    if (!summaryObject) return Response.json({ error: "R2 catalog summary is missing" }, { status: 503 });
    const summary = await summaryObject.json<ManualSummary>();

    const root = await env.MANUALS.list({ prefix: "manuals/", delimiter: "/", limit: 1000 });
    const manualPrefixes = root.delimitedPrefixes || [];
    const manuals = await Promise.all(manualPrefixes.map(async (prefix) => {
      const manualId = prefix.slice("manuals/".length).replace(/\/$/, "");
      const folders = await env.MANUALS.list({ prefix, delimiter: "/", limit: 1000 });
      const vehicles = (folders.delimitedPrefixes || [])
        .map((vehiclePrefix) => {
          const name = vehiclePrefix.slice(prefix.length).replace(/\/$/, "");
          return {
            id: vehiclePrefix,
            name,
            href: "https://motornote-manual-library.phillipstg.workers.dev/" + vehiclePrefix.split("/").map(encodeURIComponent).join("/") + "index.html"
          };
        })
        // Exclude the temporary Scion workflow-test folder from the garage.
        .filter((vehicle) => vehicle.name.trim().toLowerCase() !== "tmp");
      const meta = summary.manuals?.find((item) => item.id === manualId);
      return {
        id: manualId,
        make: meta?.make || manualId.split("-")[0],
        fileCount: meta?.file_count || 0,
        vehicles
      };
    }));

    const visibleManuals = manuals.filter((manual) => manual.vehicles.length > 0);
    const visibleFileCount = visibleManuals.reduce((total, manual) => total + manual.fileCount, 0);

    return Response.json({
      generatedAt: summary.generated_at || null,
      manualCount: visibleManuals.length,
      fileCount: visibleFileCount,
      manuals: visibleManuals
    }, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return Response.json({ error: "Unable to read the R2 manual catalog", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
};
