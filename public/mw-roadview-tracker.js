/* Maroowell Kakao Roadview map walker.
 * Current panorama position and bearing, shared by all route/map viewers.
 * No authentication or persistence. Works with Kakao Maps SDK 2.x.
 */
(function (global) {
  "use strict";
  if (global.MWRoadviewTracker) return;

  function createWalker(position) {
    const root = document.createElement("div");
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", "로드뷰 현재 위치 및 바라보는 방향");
    root.title = "로드뷰 현재 위치 / 바라보는 방향";
    root.style.cssText = "position:relative;width:66px;height:66px;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(15,23,42,.28));";

    const facing = document.createElement("div");
    facing.style.cssText = "position:absolute;inset:0;transform:rotate(0deg);transform-origin:50% 50%;transition:transform 80ms linear;";
    facing.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 66 66" width="66" height="66" aria-hidden="true"><path d="M33 1 C25 12 16 28 11 45 Q33 36 55 45 C50 28 41 12 33 1Z" fill="rgba(37,99,235,.43)" stroke="rgba(29,78,216,.8)" stroke-width="1.3"/><path d="M33 1 L33 32" stroke="#fff" stroke-width="1.6" opacity=".85"/></svg>';

    const ring = document.createElement("div");
    ring.style.cssText = "position:absolute;left:33px;top:33px;transform:translate(-50%,-50%);width:25px;height:25px;border:3px solid #fff;border-radius:50%;background:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.3),0 2px 6px rgba(15,23,42,.35);";
    const dot = document.createElement("div");
    dot.style.cssText = "position:absolute;left:33px;top:33px;transform:translate(-50%,-50%);width:7px;height:7px;background:#fff;border-radius:50%;";
    root.append(facing, ring, dot);
    const overlay = new kakao.maps.CustomOverlay({position, content:root, xAnchor:0.5, yAnchor:0.5, zIndex:1999});
    let visibleMap = null;
    return {
      setMap(map) { visibleMap = map || null; overlay.setMap(visibleMap); },
      setPosition(p) { if (p) overlay.setPosition(p); },
      setAngle(deg) {
        const angle = Number(deg);
        if (!Number.isFinite(angle)) return;
        facing.style.transform = "rotate(" + (((angle % 360) + 360) % 360) + "deg)";
      },
      getPosition() { return overlay.getPosition(); },
      getMap() { return visibleMap; }
    };
  }

  function bind(options) {
    if (!options || !options.map || !options.roadview) throw new Error("Roadview and map are required");
    const map = options.map;
    const rv = options.roadview;
    const active = typeof options.isActive === "function" ? options.isActive : () => true;
    const centerMap = options.centerMap !== false;
    let walker = null;
    let initialized = false;
    let disposed = false;

    function syncPosition() {
      if (disposed || !initialized) return;
      const point = rv.getPosition?.();
      if (!point) return;
      if (!walker) walker = createWalker(point);
      walker.setPosition(point);
      walker.setMap(active() ? map : null);
      if (active() && centerMap) map.setCenter(point);
      syncAngle();
    }
    function syncAngle() {
      if (disposed || !initialized) return;
      const point = rv.getPosition?.();
      if (!point || !active()) return;
      if (!walker) walker = createWalker(point);
      const viewpoint = rv.getViewpoint?.();
      if (viewpoint) walker.setAngle(viewpoint.pan);
    }
    function onInit() { initialized = true; syncPosition(); }
    kakao.maps.event.addListener(rv, "init", onInit);
    kakao.maps.event.addListener(rv, "position_changed", syncPosition);
    kakao.maps.event.addListener(rv, "viewpoint_changed", syncAngle);
    return {
      sync() { if (initialized) syncPosition(); },
      hide() { walker?.setMap(null); },
      destroy() {
        if (disposed) return;
        disposed = true;
        walker?.setMap(null);
        kakao.maps.event.removeListener(rv, "init", onInit);
        kakao.maps.event.removeListener(rv, "position_changed", syncPosition);
        kakao.maps.event.removeListener(rv, "viewpoint_changed", syncAngle);
      }
    };
  }

  global.MWRoadviewTracker = Object.freeze({createWalker, bind});
})(window);
