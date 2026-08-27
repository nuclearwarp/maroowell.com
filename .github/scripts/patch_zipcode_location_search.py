from pathlib import Path

path = Path("public/zipcode_search")
text = path.read_text(encoding="utf-8")

MARKER = "ZIP_LOCATION_SEARCH_V1"
if MARKER in text:
    print(f"{MARKER} already applied")
    raise SystemExit(0)

css_anchor = "    .row .grow{flex:1}\n"
css = r'''

    /* ZIP_LOCATION_SEARCH_V1 */
    .locationSearchBox{
      margin:0 0 10px;
      padding:7px;
      border:1px solid #dbe3ef;
      border-radius:13px;
      background:#f8fafc;
    }
    .locationSearchToggle{
      width:100%;
      min-height:32px;
      padding:0 9px;
      border:0;
      border-radius:9px;
      background:transparent;
      box-shadow:none;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      color:#334155;
      font-size:10.5px !important;
      text-align:left;
    }
    .locationSearchToggle:hover{background:#eef4ff;border:0}
    .locationSearchToggle strong{font-weight:1000;color:#1e293b}
    .locationSearchToggle span:last-child{color:#64748b;font-size:9.5px;white-space:nowrap}
    .locationSearchBody[hidden],
    .locationSearchResults[hidden],
    .locationSearchStatus[hidden]{display:none !important}
    .locationSearchLine{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:6px;
      margin-top:6px;
    }
    #locationSearchInput{
      height:34px;
      min-height:34px;
      padding:6px 9px !important;
      border-radius:9px !important;
      background:#fff;
      font-size:11px !important;
      font-weight:850 !important;
    }
    #locationSearchInput::placeholder{font-size:10.5px !important}
    #locationSearchBtn{
      min-height:34px;
      height:34px;
      padding:0 11px;
      border-radius:9px;
      background:#fff;
      color:#1d4ed8;
      border:1px solid #bfdbfe;
      box-shadow:none;
      font-size:10.5px !important;
    }
    .locationSearchStatus{
      margin:6px 2px 0;
      color:#64748b;
      font-size:9.5px;
      font-weight:850;
      line-height:1.35;
    }
    .locationSearchResults{
      margin-top:6px;
      max-height:190px;
      overflow:auto;
      border:1px solid #e2e8f0;
      border-radius:9px;
      background:#fff;
    }
    .locationSearchResult{
      width:100%;
      min-height:0;
      display:block;
      padding:8px 9px;
      border:0;
      border-bottom:1px solid #eef2f7;
      border-radius:0;
      background:#fff;
      box-shadow:none;
      text-align:left;
    }
    .locationSearchResult:last-child{border-bottom:0}
    .locationSearchResult:hover{border-color:#eef2f7;background:#f8fbff}
    .locationSearchResultTitle{
      display:block;
      overflow:hidden;
      color:#0f172a;
      font-size:10.5px;
      font-weight:1000;
      line-height:1.35;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .locationSearchResultMeta{
      display:block;
      margin-top:2px;
      overflow:hidden;
      color:#64748b;
      font-size:9px;
      font-weight:800;
      line-height:1.35;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
'''
if css_anchor not in text:
    raise SystemExit("CSS anchor not found")
text = text.replace(css_anchor, css_anchor + css, 1)

html_anchor = '        <label for="zipInput">우편번호 목록</label>\n'
html = r'''        <!-- ZIP_LOCATION_SEARCH_V1 -->
        <div class="locationSearchBox">
          <button id="locationSearchToggle" class="locationSearchToggle" type="button" aria-expanded="false" aria-controls="locationSearchBody">
            <strong>📍 위치 검색</strong>
            <span id="locationSearchToggleLabel">펼치기</span>
          </button>
          <div id="locationSearchBody" class="locationSearchBody" hidden>
            <div class="locationSearchLine">
              <input id="locationSearchInput" type="search" autocomplete="off" placeholder="주소 · 장소 · 상호 검색" />
              <button id="locationSearchBtn" type="button">검색</button>
            </div>
            <div id="locationSearchStatus" class="locationSearchStatus" hidden></div>
            <div id="locationSearchResults" class="locationSearchResults" hidden></div>
          </div>
        </div>

'''
if html_anchor not in text:
    raise SystemExit("HTML anchor not found")
text = text.replace(html_anchor, html + html_anchor, 1)

state_anchor = "        kakaoGeocoder: null,\n"
if state_anchor not in text:
    raise SystemExit("State anchor not found")
text = text.replace(
    state_anchor,
    state_anchor + "        kakaoPlaces: null,\n        locationSearchMarker: null,\n",
    1,
)

fn_anchor = "      function clearZipSelection() {\n"
funcs = r'''      // ZIP_LOCATION_SEARCH_V1
      function setLocationSearchStatus(message = "") {
        const el = $("#locationSearchStatus");
        if (!el) return;
        const value = String(message || "").trim();
        el.textContent = value;
        el.hidden = !value;
      }

      function clearLocationSearchResults() {
        const box = $("#locationSearchResults");
        if (!box) return;
        box.replaceChildren();
        box.hidden = true;
      }

      function focusLocationSearchResult(item) {
        if (!state.map || !item) return;
        const lat = Number(item.lat);
        const lng = Number(item.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const position = new kakao.maps.LatLng(lat, lng);
        try {
          if (Number(state.map.getLevel?.()) > 4) state.map.setLevel(4);
          state.map.panTo(position);
        } catch {}

        try {
          if (!state.locationSearchMarker) {
            state.locationSearchMarker = new kakao.maps.Marker({ position, map: state.map });
          } else {
            state.locationSearchMarker.setPosition(position);
            state.locationSearchMarker.setMap(state.map);
          }
        } catch {}
      }

      function renderLocationSearchResults(items) {
        const box = $("#locationSearchResults");
        if (!box) return;
        box.replaceChildren();

        for (const item of items) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "locationSearchResult";

          const title = document.createElement("span");
          title.className = "locationSearchResultTitle";
          title.textContent = item.title || item.address || "검색 결과";

          const meta = document.createElement("span");
          meta.className = "locationSearchResultMeta";
          const parts = [];
          if (item.kind) parts.push(item.kind);
          if (item.address && item.address !== item.title) parts.push(item.address);
          meta.textContent = parts.join(" · ");

          button.append(title, meta);
          button.addEventListener("click", () => focusLocationSearchResult(item));
          box.appendChild(button);
        }
        box.hidden = items.length === 0;
      }

      function kakaoKeywordSearch(query) {
        return new Promise((resolve) => {
          try {
            if (!kakao.maps.services?.Places) return resolve([]);
            if (!state.kakaoPlaces) state.kakaoPlaces = new kakao.maps.services.Places();
            state.kakaoPlaces.keywordSearch(query, (data, status) => {
              resolve(status === kakao.maps.services.Status.OK && Array.isArray(data) ? data : []);
            }, { size: 8 });
          } catch {
            resolve([]);
          }
        });
      }

      function kakaoAddressSearch(query) {
        return new Promise((resolve) => {
          try {
            if (!state.kakaoGeocoder?.addressSearch) return resolve([]);
            state.kakaoGeocoder.addressSearch(query, (data, status) => {
              resolve(status === kakao.maps.services.Status.OK && Array.isArray(data) ? data : []);
            });
          } catch {
            resolve([]);
          }
        });
      }

      async function runLocationSearch() {
        const input = $("#locationSearchInput");
        const button = $("#locationSearchBtn");
        const query = String(input?.value || "").trim();
        if (!query) {
          clearLocationSearchResults();
          setLocationSearchStatus("검색할 주소나 장소를 입력해 주세요.");
          input?.focus();
          return;
        }

        if (button) button.disabled = true;
        setLocationSearchStatus("카카오맵에서 검색 중…");
        clearLocationSearchResults();

        try {
          const [addresses, places] = await Promise.all([
            kakaoAddressSearch(query),
            kakaoKeywordSearch(query),
          ]);
          const merged = [];
          const seen = new Set();
          const push = (item) => {
            const lat = Number(item?.lat);
            const lng = Number(item?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            const key = `${lat.toFixed(6)}|${lng.toFixed(6)}|${String(item?.title || item?.address || "")}`;
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(item);
          };

          addresses.forEach((row) => push({
            title: String(row?.road_address?.address_name || row?.address_name || query),
            address: String(row?.address_name || row?.road_address?.address_name || ""),
            lat: Number(row?.y),
            lng: Number(row?.x),
            kind: "주소",
          }));
          places.forEach((row) => push({
            title: String(row?.place_name || query),
            address: String(row?.road_address_name || row?.address_name || ""),
            lat: Number(row?.y),
            lng: Number(row?.x),
            kind: String(row?.category_group_name || "장소"),
          }));

          const rows = merged.slice(0, 10);
          renderLocationSearchResults(rows);
          if (!rows.length) {
            setLocationSearchStatus("검색 결과가 없습니다.");
            return;
          }
          focusLocationSearchResult(rows[0]);
          setLocationSearchStatus(`${rows.length}개 결과 · 첫 결과 위치로 이동했습니다.`);
        } finally {
          if (button) button.disabled = false;
        }
      }

'''
if fn_anchor not in text:
    raise SystemExit("Function anchor not found")
text = text.replace(fn_anchor, funcs + fn_anchor, 1)

event_anchor = '''        $("#zipInput").addEventListener("keydown", (e) => {\n          if (e.key !== "Enter" || e.shiftKey) return;\n          e.preventDefault();\n          $("#searchBtn").click();\n        });\n\n'''
event_patch = event_anchor + r'''        const locationSearchToggle = $("#locationSearchToggle");
        const locationSearchBody = $("#locationSearchBody");
        const locationSearchToggleLabel = $("#locationSearchToggleLabel");
        locationSearchToggle?.addEventListener("click", () => {
          const opening = Boolean(locationSearchBody?.hidden);
          if (locationSearchBody) locationSearchBody.hidden = !opening;
          locationSearchToggle.setAttribute("aria-expanded", opening ? "true" : "false");
          if (locationSearchToggleLabel) locationSearchToggleLabel.textContent = opening ? "접기" : "펼치기";
          if (opening) window.setTimeout(() => $("#locationSearchInput")?.focus(), 0);
        });
        $("#locationSearchBtn")?.addEventListener("click", runLocationSearch);
        $("#locationSearchInput")?.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          runLocationSearch();
        });

'''
if event_anchor not in text:
    raise SystemExit("Event anchor not found")
text = text.replace(event_anchor, event_patch, 1)

esc_old = '''        document.addEventListener("keydown", (e) => {\n          if (e.key !== "Escape") return;\n          clearZipSelection();\n        });\n'''
esc_new = '''        document.addEventListener("keydown", (e) => {\n          if (e.key !== "Escape") return;\n          closeApartmentPopup();\n          clearZipSelection();\n        });\n'''
if esc_old not in text:
    raise SystemExit("ESC anchor not found")
text = text.replace(esc_old, esc_new, 1)

for token in (
    MARKER,
    'id="locationSearchInput"',
    "new kakao.maps.services.Places()",
    "kakaoGeocoder.addressSearch",
    "closeApartmentPopup();\n          clearZipSelection();",
):
    if token not in text:
        raise SystemExit(f"Missing required token: {token}")

path.write_text(text, encoding="utf-8")
print("zipcode location search patch applied")
