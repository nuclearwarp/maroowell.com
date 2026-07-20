(() => {
  "use strict";

  if (window.__MW_ZIPCODE_SEARCH_ENHANCEMENTS__) return;
  window.__MW_ZIPCODE_SEARCH_ENHANCEMENTS__ = true;

  const registry = {
    map: null,
    polygons: [],
    polygonsByZip: new Map(),
    terrainByZip: new Map(),
    selectedZip: "",
    suppressMapClearUntil: 0,
    refreshTimer: 0,
  };

  const originalFetch = window.fetch.bind(window);

  function normalizeZip(value) {
    const match = String(value ?? "").match(/\d{5}/);
    return match ? match[0] : "";
  }

  function parseRequestZip(input, init) {
    try {
      if (init?.body && typeof init.body === "string") {
        const parsed = JSON.parse(init.body);
        return normalizeZip(parsed?.zipcode);
      }
    } catch {}

    try {
      if (input instanceof Request) {
        return normalize