(() => {
  "use strict";

  const { municipalities, municipalityLabels, settlements } = window.atlasAmurMapData;
  const symbols = window.AmurDemoMapSymbols;
  const features = [...municipalities.features, ...settlements.features];
  const byKey = new Map(features.map(feature => [feature.properties.key, feature]));
  const byId = new Map(features.map(feature => [feature.id, feature.properties.key]));
  const municipalitySource = "amur-municipalities";
  const settlementSource = "amur-settlements";
  const fill = "amur-municipality-fill";
  const outline = "amur-municipality-outline";
  const selectedOutline = "amur-municipality-selected";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  function extendBounds(bounds, geometry) {
    const coordinates = geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
    for (const point of coordinates) bounds.extend(point);
    return bounds;
  }

  function create(container, options) {
    const { medical } = options;
    const { Map, LngLatBounds, NavigationControl, ScaleControl, Popup } = window.maplibregl;
    const region = municipalities.features.reduce((bounds, { geometry }) => extendBounds(bounds, geometry), new LngLatBounds());
    const map = new Map({
      container,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "amur-background", type: "background", paint: { "background-color": "#eef2f5" } }]
      },
      center: [128.3, 52.8],
      zoom: 5.1,
      minZoom: 3.5,
      maxZoom: 15.5,
      pitchWithRotate: false,
      attributionControl: false,
      fadeDuration: 0,
      locale: {
        "NavigationControl.ZoomIn": "Увеличить масштаб",
        "NavigationControl.ZoomOut": "Уменьшить масштаб",
        "NavigationControl.ResetBearing": "Вернуть ориентацию на север"
      }
    });
    map.getCanvas().setAttribute("aria-label", "Карта Амурской области");
    map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
    const popup = new Popup({
      closeButton: false, closeOnClick: false, focusAfterOpen: false,
      offset: 16, maxWidth: "200px", className: "mortality-hover-popup"
    });
    let ready = false;
    let fitPending = true;
    let hovered = null;
    let model = { colours: new window.Map(), selected: "region", settlements: false, labels: "auto" };
    let pendingFocus = null;

    function clearHover() {
      hovered = null;
      popup.remove();
      map.getCanvas().style.cursor = "";
    }

    const dock = window.AmurTerritoryCard.createDock({
      container,
      map,
      getData: () => options.isActive() && model.selected !== "region" ? card(model.selected) : null,
      getItems: () => options.isActive() ? options.items().map(item => ({ ...item, id: byKey.get(item.id).id })) : [],
      onSelect: (id, settings) => options.select(byId.get(id), settings),
      onClear: () => options.select("region"),
      onDetails: options.openInformation,
      isHidden: () => !options.isActive() || options.hideCard(),
      onEscape: () => options.isActive() && options.escape()
    });

    function card(key) {
      const data = options.card(key);
      return data ? { ...data, id: byKey.get(key).id } : null;
    }

    function paint() {
      if (!ready) return;
      for (const [key, colour] of model.colours) {
        map.setFeatureState({ source: municipalitySource, id: byKey.get(key).id }, { colour });
      }
      const feature = byKey.get(model.selected);
      map.setFilter(selectedOutline, ["==", ["id"], feature?.geometry.type === "Point" ? -1 : feature?.id ?? -1]);
      symbols.update(map, { settlements: model.settlements, labels: model.labels, medical,
        selection: feature?.geometry.type === "Point" ? feature.id : null });
    }

    function fitRegion(animate = true) {
      if (!ready || !container.clientWidth || !container.clientHeight) {
        fitPending = true;
        return;
      }
      fitPending = false;
      map.fitBounds(region, {
        padding: Math.min(52, Math.floor(container.clientWidth / 8), Math.floor(container.clientHeight / 8)),
        duration: animate && !reduceMotion.matches ? 420 : 0,
        bearing: 0,
        pitch: 0
      });
    }

    function focusFeature(key) {
      const feature = byKey.get(key);
      if (!feature) return;
      if (!ready) {
        pendingFocus = key;
        return;
      }
      const duration = reduceMotion.matches ? 0 : 420;
      if (feature.geometry.type === "Point") {
        map.easeTo({ center: feature.geometry.coordinates, zoom: Math.max(map.getZoom(), 9.2), duration });
      } else {
        map.fitBounds(extendBounds(new LngLatBounds(), feature.geometry), {
          padding: Math.min(70, Math.floor(container.clientWidth / 6), Math.floor(container.clientHeight / 6)),
          maxZoom: 10.5, duration
        });
      }
    }

    function hit(point) {
      if (!ready) return null;
      const layers = model.settlements ? [...symbols.pointIds, fill] : [fill];
      return map.queryRenderedFeatures(point, { layers })[0]?.properties.key ?? null;
    }

    map.on("load", () => {
      map.addSource(municipalitySource, { type: "geojson", data: municipalities });
      map.addSource(settlementSource, { type: "geojson", data: settlements });
      map.addLayer({
        id: fill, source: municipalitySource, type: "fill",
        paint: { "fill-color": ["to-color", ["coalesce", ["feature-state", "colour"], "#e4e7e9"]] }
      });
      map.addLayer({
        id: outline, source: municipalitySource, type: "line",
        paint: { "line-color": "#6a8794", "line-width": 0.8 }
      });
      map.addLayer({
        id: selectedOutline, source: municipalitySource, type: "line",
        filter: ["==", ["id"], -1],
        paint: { "line-color": "#16394e", "line-width": 2.5 }
      });
      symbols.addLayers(map, settlementSource, medical);
      if (medical) {
        const source = "amur-municipality-labels";
        map.addSource(source, { type: "geojson", data: municipalityLabels });
        map.addLayer({
          id: source, source, type: "symbol", minzoom: 8.35,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11.5,
            "text-max-width": 10,
            "text-allow-overlap": false
          },
          paint: { "text-color": "#52677c", "text-halo-color": "rgba(255,255,255,.88)", "text-halo-width": 1.2 }
        });
      }
      symbols.addLabels(map, settlementSource, medical);
      ready = true;
      paint();
      fitRegion(false);
      if (options.isActive()) applyPendingFocus();
      container.dataset.mapReady = "true";
    });

    map.on("click", event => {
      if (!ready || !options.isActive()) return;
      clearHover();
      options.select(hit(event.point) ?? "region");
    });
    map.on("mousemove", event => {
      if (!options.isActive() || !window.AtlasInteraction.canHover(event.originalEvent) || map.isMoving()) {
        clearHover();
        return;
      }
      const key = hit(event.point);
      if (!key || key === model.selected) {
        clearHover();
        if (key) map.getCanvas().style.cursor = "pointer";
        return;
      }
      if (key !== hovered) {
        hovered = key;
        popup.setHTML(window.AmurTerritoryCard.render(card(key))).setLngLat(event.lngLat).addTo(map);
      } else {
        popup.setLngLat(event.lngLat);
      }
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("movestart", clearHover);
    map.getCanvas().addEventListener("mouseleave", clearHover);

    function applyPendingFocus() {
      if (!pendingFocus) return;
      const key = pendingFocus;
      pendingFocus = null;
      focusFeature(key);
    }

    const resize = () => {
      if (!container.clientWidth || !container.clientHeight) return;
      map.resize();
      if (ready && fitPending) fitRegion(false);
      if (ready && options.isActive()) applyPendingFocus();
    };
    new ResizeObserver(resize).observe(container);

    return {
      update(next, { focus = false } = {}) {
        clearHover();
        model = next;
        paint();
        dock.update({ focus });
      },
      resize,
      focusFeature,
      fitRegion,
      deactivate() {
        clearHover();
        const picker = container.querySelector(".territory-picker");
        if (picker) picker.open = false;
      }
    };
  }

  window.atlasDemoMap = { create };
})();
