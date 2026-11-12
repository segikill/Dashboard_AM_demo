(() => {
  "use strict";

  // Shared by both maps. No account, API key or expiring URL is needed.
  const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
  const LOAD_TIMEOUT_MS = 8000;
  const PREFIX = "atlas-basemap-";
  const ATTRIBUTION = '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> '
    + '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> '
    + 'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

  const localStyle = () => ({
    version: 8,
    sources: {},
    layers: [{
      id: `${PREFIX}local-background`,
      type: "background",
      paint: { "background-color": "#eef2f5" }
    }]
  });

  // Start with a local style: a slow/failed external server must never delay
  // the map's load event, analytical sources, controls, or popups.
  const attach = (map, { beforeId, onChange = () => {}, visible = true } = {}) => {
    const abort = new AbortController();
    const sourceIds = new Set();
    const layerIds = [];
    let disposed = false;
    let state = "loading";
    let reason = "";
    let enabled = visible;
    let timer;

    const notify = () => onChange({ state, reason, visible: enabled });
    const armTimeout = () => {
      clearTimeout(timer);
      if (enabled && state === "loading") timer = setTimeout(() => fallback("timeout"), LOAD_TIMEOUT_MS);
    };
    const clearRemote = () => {
      [...layerIds].reverse().forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
      layerIds.length = 0;
      sourceIds.forEach((id) => { if (map.getSource(id)) map.removeSource(id); });
      sourceIds.clear();
    };
    const fallback = (why) => {
      if (disposed || state === "local") return;
      state = "local";
      reason = why;
      clearTimeout(timer);
      abort.abort();
      clearRemote();
      notify();
    };
    const onError = (event) => {
      // A failed analytical source is not a basemap error.
      if (sourceIds.has(event.sourceId)) fallback("source-error");
    };
    const onSourceData = (event) => {
      // TileJSON alone is not proof that the actual map tiles work.
      if (!disposed && state === "loading" && sourceIds.has(event.sourceId)
        && event.tile?.state === "loaded") {
        state = "online";
        clearTimeout(timer);
        notify();
      }
    };
    const setVisible = (value) => {
      if (enabled === Boolean(value)) return;
      enabled = Boolean(value);
      layerIds.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
      });
      armTimeout();
    };

    map.on("error", onError);
    map.on("sourcedata", onSourceData);
    armTimeout();

    const ready = (async () => {
      try {
        const response = await fetch(STYLE_URL, { signal: abort.signal });
        if (!response.ok) throw new Error(`Basemap style HTTP ${response.status}`);
        const style = await response.json();
        if (disposed || state === "local") return;
        if (style.version !== 8 || !style.sources || !Array.isArray(style.layers)) {
          throw new Error("Invalid basemap style");
        }
        // Positron without labels, as before. Analytical labels belong to
        // the portal; external glyphs, sprites and POIs are not required.
        const layers = style.layers.filter((layer) => ["fill", "line", "background"].includes(layer.type));
        if (!layers.some((layer) => layer.source)) throw new Error("Basemap has no drawable data");
        const usedSources = new Set(layers.map((layer) => layer.source).filter(Boolean));
        usedSources.forEach((id) => {
          const source = style.sources[id];
          if (!source) throw new Error(`Missing basemap source ${id}`);
          const remoteId = `${PREFIX}${id}`;
          map.addSource(remoteId, { ...source, attribution: ATTRIBUTION });
          sourceIds.add(remoteId);
        });
        const anchor = typeof beforeId === "function" ? beforeId() : beforeId;
        layers.forEach((layer) => {
          const id = `${PREFIX}${layer.id}`;
          map.addLayer({
            ...layer,
            id,
            ...(layer.source ? { source: `${PREFIX}${layer.source}` } : {}),
            layout: { ...layer.layout, visibility: enabled ? "visible" : "none" }
          }, anchor);
          layerIds.push(id);
        });
      } catch (error) {
        if (!disposed && state !== "local") fallback("style-error");
      }
    })();

    return {
      ready,
      setVisible,
      getStatus: () => ({ state, reason, visible: enabled, sources: [...sourceIds], layers: [...layerIds] }),
      destroy: () => {
        disposed = true;
        clearTimeout(timer);
        abort.abort();
        map.off("error", onError);
        map.off("sourcedata", onSourceData);
      }
    };
  };

  window.AmurBasemap = { localStyle, attach };
})();
