(() => {
  "use strict";

  const classes = [
    { code: "under_1k", label: "До 1 тыс.", diameter: 6 },
    { code: "1k_2_5k", label: "1–2,5 тыс.", diameter: 8 },
    { code: "2_5k_5k", label: "2,5–5 тыс.", diameter: 12 },
    { code: "5k_10k", label: "5–10 тыс.", diameter: 17 },
    { code: "10k_20k", label: "10–20 тыс.", diameter: 21 },
    { code: "20k_40k", label: "20–40 тыс.", diameter: 26 },
    { code: "40k_200k", label: "40–200 тыс.", diameter: 42, ring: 8 },
    { code: "over_200k", label: "Более 200 тыс.", diameter: 62, ring: 11 }
  ];
  const prefix = "amur-settlement-";
  const pointIds = [...classes.map(item => prefix + item.code), prefix + "missing"];
  const outlineIds = classes.filter(item => item.ring).flatMap(item => [
    prefix + item.code + "-inner-outline", prefix + item.code + "-outline"
  ]);
  const population = ["coalesce", ["get", "population2021"], 0];
  const city = ["==", ["get", "is_city"], true];
  const nonCity = ["==", ["get", "is_city"], false];
  const selected = prefix + "selected";
  const cityLabel = prefix + "label-city";
  const otherLabels = [prefix + "label-major", prefix + "label-minor"];

  const zoom = (...stops) => ["interpolate", ["linear"], ["zoom"], ...stops];

  function addLayers(map, source, medical) {
    for (const { code, diameter, ring } of classes) {
      const id = prefix + code;
      const filter = ["==", ["get", "population_class"], code];
      const base = diameter / 2;
      const radius = zoom(4, base * (medical ? .68 : .66), 6, base * (medical ? .78 : .76),
        8, base * .9, 10, base, 12, base * 1.08);
      map.addLayer({
        id, type: "circle", source, filter,
        paint: ring ? {
          "circle-radius": radius,
          "circle-color": "rgba(255,255,255,.44)",
          "circle-opacity": .82,
          "circle-stroke-color": "#3f8693",
          "circle-stroke-opacity": medical ? .84 : .9,
          "circle-stroke-width": medical ? zoom(4, ring * .68, 9, ring * .95, 12, ring * 1.05) :
            zoom(4, ring * .66, 9, ring * .94, 12, ring * 1.04)
        } : {
          "circle-radius": radius,
          "circle-color": "#6daeba",
          "circle-opacity": medical ? .86 : .88,
          "circle-stroke-color": "#324b62",
          "circle-stroke-opacity": medical ? .78 : .76,
          "circle-stroke-width": zoom(4, .55, 9, .9, 12, 1.1)
        }
      });
      if (ring && !medical) {
        map.addLayer({
          id: id + "-inner-outline", type: "circle", source, filter,
          paint: {
            "circle-radius": radius,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#324b62",
            "circle-stroke-opacity": .82,
            "circle-stroke-width": zoom(4, .7, 9, 1, 12, 1.2)
          }
        });
        map.addLayer({
          id: id + "-outline", type: "circle", source, filter,
          paint: {
            "circle-radius": zoom(4, base * .66 + ring * .66, 6, base * .76 + ring * .78,
              8, base * .9 + ring * .9, 10, base + ring * .97, 12, base * 1.08 + ring * 1.04),
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#324b62",
            "circle-stroke-opacity": .82,
            "circle-stroke-width": zoom(4, .75, 9, 1.05, 12, 1.25)
          }
        });
      }
    }
    map.addLayer({
      id: prefix + "missing", type: "circle", source, filter: ["<=", population, 0],
      paint: {
        "circle-radius": zoom(4, 2.2, 10, 3.4),
        "circle-color": "#ffffff",
        "circle-opacity": .55,
        "circle-stroke-color": "#63758a",
        "circle-stroke-width": 1
      }
    });
    const selectedRadius = scale => ["+", ["*", ["coalesce", ["get", "diameter_px"], 7], scale], 6];
    map.addLayer({
      id: selected, type: "circle", source, filter: ["==", ["id"], -1],
      paint: {
        "circle-radius": zoom(4, selectedRadius(.33), 8, selectedRadius(.45), 12, selectedRadius(.54)),
        "circle-color": "rgba(244,180,0,.08)",
        "circle-stroke-color": "#f4b400",
        "circle-stroke-width": 2.4
      }
    });
  }

  function addLabels(map, source, medical) {
    const labels = [
      { id: cityLabel, minzoom: 5, filter: city, font: "Noto Sans Bold", size: zoom(5, 11, 8, 13.5, 11, 15),
        offset: 1.15, color: "#17304d", haloOpacity: medical ? .9 : .86, haloWidth: medical ? 1.4 : 1.25 },
      { id: otherLabels[0], minzoom: 7.2, filter: ["all", nonCity, [">=", population, 2500]],
        font: "Noto Sans Regular", size: zoom(7.2, 9.5, 10, 10.5, 12, 11.5),
        offset: 1, color: "#40546b", haloOpacity: medical ? .88 : .84, haloWidth: medical ? 1.15 : 1 },
      { id: otherLabels[1], minzoom: 9.6, filter: ["all", nonCity, ["<", population, 2500]],
        font: "Noto Sans Regular", size: zoom(9.6, 9, 12, 10.5, 14, 11.5),
        offset: .9, color: "#5a6879", haloOpacity: medical ? .85 : .82, haloWidth: medical ? 1 : .9 }
    ];
    for (const { id, minzoom, filter, font, size, offset, color, haloOpacity, haloWidth } of labels) {
      map.addLayer({
        id, type: "symbol", source, minzoom, filter,
        layout: {
          "text-field": ["get", "name"],
          "text-font": [font],
          "text-size": size,
          "text-offset": [0, offset],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true
        },
        paint: { "text-color": color, "text-halo-color": "rgba(255,255,255," + haloOpacity + ")", "text-halo-width": haloWidth }
      });
    }
  }

  function update(map, { settlements, labels, selection, medical }) {
    const visibility = (id, visible) => map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    for (const id of [...pointIds, ...(medical ? [] : outlineIds), selected]) visibility(id, settlements);
    map.setFilter(selected, ["==", ["id"], selection ?? -1]);
    visibility(cityLabel, labels !== "off");
    for (const id of otherLabels) visibility(id, labels === "auto" && (settlements || medical));
  }

  window.AmurDemoMapSymbols = { classes, pointIds, addLayers, addLabels, update };
})();
