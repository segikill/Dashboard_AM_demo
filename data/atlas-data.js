/**
 * Runtime assembler and lazy spatial-data loader for Dashboard_AM.
 * Local demo: no individual observations.
 */
((root, documentRef) => {
  "use strict";
  const data = root.AMUR_ATLAS_REFERENCE;
  if (!data) {
    throw new Error("Atlas core resources failed to load before atlas-data.js.");
  }
  data.records = [];
  root.AMUR_ATLAS_DATA = data;

  const spatialUrl = "data/atlas-spatial.js?v=689158da8208";
  let spatialReady = Array.isArray(data.mapBounds3857);
  let spatialPromise = null;
  let spatialError = null;

  const emit = (status, error = null) => {
    if (typeof root.dispatchEvent !== "function" || typeof root.CustomEvent !== "function") return;
    root.dispatchEvent(new root.CustomEvent("atlas:spatial-status", {
      detail: { status, error: error ? String(error.message || error) : null }
    }));
  };

  const applySpatial = (payload) => {
    if (!payload || !Array.isArray(payload.mapBounds3857) || payload.mapBounds3857.length !== 4) {
      throw new Error("Spatial package has invalid map bounds.");
    }
    if (!Array.isArray(payload.municipalityGeometries)
      || payload.municipalityGeometries.length !== data.municipalities.length) {
      throw new Error("Spatial package has an invalid municipality geometry count.");
    }
    if (!Array.isArray(payload.settlementCoordinates)
      || payload.settlementCoordinates.length !== data.settlements.length) {
      throw new Error("Spatial package has an invalid settlement coordinate count.");
    }
    data.mapBounds3857 = payload.mapBounds3857;
    payload.municipalityGeometries.forEach((geometry, index) => {
      data.municipalities[index].geometry = geometry;
    });
    payload.settlementCoordinates.forEach((coordinates, index) => {
      const [lat, lon, x3857, y3857] = coordinates;
      Object.assign(data.settlements[index], { lat, lon, x3857, y3857 });
    });
    spatialReady = true;
    spatialError = null;
    try { delete root.AMUR_ATLAS_SPATIAL; } catch (_) { root.AMUR_ATLAS_SPATIAL = null; }
    emit("ready");
    return data;
  };

  const loadSpatial = (options = {}) => {
    if (spatialReady) return Promise.resolve(data);
    if (spatialPromise && !options.retry) return spatialPromise;
    if (!documentRef) return Promise.reject(new Error("Spatial loading requires a browser document."));
    const existing = documentRef.getElementById("amur-atlas-spatial-data");
    if (existing) existing.remove();
    spatialError = null;
    emit("loading");
    spatialPromise = new Promise((resolve, reject) => {
      const script = documentRef.createElement("script");
      script.id = "amur-atlas-spatial-data";
      script.async = true;
      script.src = spatialUrl + (options.retry ? "&retry=" + Date.now() : "");
      script.addEventListener("load", () => {
        try {
          resolve(applySpatial(root.AMUR_ATLAS_SPATIAL));
        } catch (error) {
          spatialError = error;
          spatialPromise = null;
          emit("error", error);
          reject(error);
        }
      }, { once: true });
      script.addEventListener("error", () => {
        const error = new Error("Не удалось загрузить резервную геометрию карты.");
        spatialError = error;
        spatialPromise = null;
        emit("error", error);
        reject(error);
      }, { once: true });
      documentRef.head.appendChild(script);
    });
    return spatialPromise;
  };

  root.AmurAtlasDataLoader = Object.freeze({
    applySpatial,
    loadSpatial,
    retrySpatial: () => loadSpatial({ retry: true }),
    isSpatialReady: () => spatialReady,
    getStatus: () => Object.freeze({
      coreReady: true,
      spatialReady,
      spatialLoading: Boolean(spatialPromise && !spatialReady),
      spatialError: spatialError ? String(spatialError.message || spatialError) : null,
      spatialUrl
    })
  });
})(window, typeof document === "undefined" ? null : document);
