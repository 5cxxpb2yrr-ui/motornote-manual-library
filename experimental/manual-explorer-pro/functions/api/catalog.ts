interface Env { MANUALS: R2Bucket; }
const vehicles = [
  {
    id: "2006-scion-xb", year: 2006, make: "Scion", model: "xB", engine: "1NZ-FE", owned: true,
    manualRoot: "manuals/scion-service-manual/2006 Scion xB L4-1.5L (1NZ-FE)/",
    indexKey: "manuals/scion-service-manual/2006 Scion xB L4-1.5L (1NZ-FE)/index.html", treeKeys: []
  },
  {
    id: "2019-subaru-crosstrek-limited", year: 2019, make: "Subaru", model: "Crosstrek Limited",
    engine: "FB20D", drivetrain: "AWD", eyesight: true, owned: true,
    manualRoot: "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/",
    indexKey: "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/index.html",
    treeKeys: [
      "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/2019 Subaru Crosstrek/Repair and Diagnosis/Subaru-repairanddiagnosis-tree.json",
      "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/2019 Subaru Crosstrek/Labor Times/Subaru-labortimes-tree.json"
    ]
  }
] as const;
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const results = await Promise.all(vehicles.map(async vehicle => {
    const checks = await Promise.all([vehicle.indexKey,...vehicle.treeKeys].map(key=>env.MANUALS.head(key)));
    return { ...vehicle, available: checks.some(Boolean) };
  }));
  const manifest = await env.MANUALS.get("search-index/v1/manifest.json");
  let documentCount = 0;
  if (manifest) {
    try { const data = await manifest.json<{documentCount?:number}>(); documentCount = Number(data.documentCount || 0); } catch { /* invalid manifest remains unavailable */ }
  }
  return Response.json({
    generatedAt: new Date().toISOString(), vehicles: results,
    searchIndex: { available: Boolean(manifest), documentCount }
  }, { headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } });
};