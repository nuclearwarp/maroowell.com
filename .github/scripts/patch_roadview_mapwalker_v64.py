from pathlib import Path
import re


def patch_zipcode(path: Path):
    text = path.read_text(encoding="utf-8")
    if "MW_ROADVIEW_MAPWALKER_V64" in text:
        return

    text = text.replace(
        "        roadviewClickHandler: null,",
        "        roadviewClickHandler: null,\n        roadviewWalkerV64: null,",
        1,
    )

    old = '''      function ensureRoadview() {
        if (state.roadview && state.roadviewClient) return;
        state.roadview = new kakao.maps.Roadview($("#roadview"));
        state.roadviewClient = new kakao.maps.RoadviewClient();
      }
'''
    new = '''      // MW_ROADVIEW_MAPWALKER_V64
      function createRoadviewWalkerV64(position) {
        const root = document.createElement("div");
        root.style.cssText = "position:relative;width:46px;height:46px;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(15,23,42,.28));";
        const cone = document.createElement("div");
        cone.style.cssText = "position:absolute;left:50%;top:-21px;width:25px;height:32px;transform:translateX(-50%) rotate(0deg);transform-origin:50% 37px;background:rgba(37,99,235,.48);clip-path:polygon(50% 0,100% 100%,50% 77%,0 100%);";
        const halo = document.createElement("div");
        halo.style.cssText = "position:absolute;left:50%;top:50%;width:30px;height:30px;transform:translate(-50%,-50%);border-radius:999px;background:rgba(37,99,235,.16);border:2px solid rgba(37,99,235,.72);";
        const dot = document.createElement("div");
        dot.style.cssText = "position:absolute;left:50%;top:50%;width:12px;height:12px;transform:translate(-50%,-50%);border-radius:999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 1px rgba(37,99,235,.25);";
        root.appendChild(cone);
        root.appendChild(halo);
        root.appendChild(dot);
        const overlay = new kakao.maps.CustomOverlay({ position, content: root, xAnchor:.5, yAnchor:.5, zIndex:99 });
        return {
          setMap(targetMap) { overlay.setMap(targetMap); },
          setPosition(nextPosition) { if (nextPosition) overlay.setPosition(nextPosition); },
          setAngle(angle) {
            const pan = ((Number(angle) || 0) % 360 + 360) % 360;
            cone.style.transform = `translateX(-50%) rotate(${pan}deg)`;
          }
        };
      }

      function syncRoadviewWalkerV64() {
        if (!state.roadview || !state.map) return;
        const position = state.roadview.getPosition?.() || state.map.getCenter();
        if (!state.roadviewWalkerV64) state.roadviewWalkerV64 = createRoadviewWalkerV64(position);
        state.roadviewWalkerV64.setPosition(position);
        if (state.roadviewOn) state.roadviewWalkerV64.setMap(state.map);
        const viewpoint = state.roadview.getViewpoint?.();
        if (viewpoint) state.roadviewWalkerV64.setAngle(viewpoint.pan);
      }

      function ensureRoadview() {
        if (state.roadview && state.roadviewClient) return;
        state.roadview = new kakao.maps.Roadview($("#roadview"));
        state.roadviewClient = new kakao.maps.RoadviewClient();
        kakao.maps.event.addListener(state.roadview, "init", syncRoadviewWalkerV64);
        kakao.maps.event.addListener(state.roadview, "viewpoint_changed", () => {
          if (!state.roadviewWalkerV64) syncRoadviewWalkerV64();
          const viewpoint = state.roadview.getViewpoint?.();
          if (viewpoint && state.roadviewWalkerV64) state.roadviewWalkerV64.setAngle(viewpoint.pan);
        });
        kakao.maps.event.addListener(state.roadview, "position_changed", () => {
          const position = state.roadview.getPosition?.();
          if (!position) return;
          if (!state.roadviewWalkerV64) syncRoadviewWalkerV64();
          state.roadviewWalkerV64?.setPosition(position);
          if (state.roadviewOn) state.roadviewWalkerV64?.setMap(state.map);
          state.map.setCenter(position);
        });
      }
'''
    if old not in text:
        raise SystemExit(f"{path}: ensureRoadview anchor missing")
    text = text.replace(old, new, 1)
    text = text.replace(
        "          setRoadviewOverlay(true);",
        "          setRoadviewOverlay(true);\n          state.roadviewWalkerV64?.setMap(state.map);",
        1,
    )
    text = text.replace(
        "          setRoadviewOverlay(false);",
        "          setRoadviewOverlay(false);\n          state.roadviewWalkerV64?.setMap(null);",
        1,
    )
    path.write_text(text, encoding="utf-8")


def patch_route(path: Path):
    text = path.read_text(encoding="utf-8")
    if "MW_ROADVIEW_MAPWALKER_V64" in text:
        return text

    text = text.replace(
        "  let roadview=null, roadviewClient=null, roadviewOn=false;",
        "  let roadview=null, roadviewClient=null, roadviewOn=false, roadviewWalkerV64=null;",
        1,
    )

    old = '''    function ensureRoadview(){
      if (roadview && roadviewClient) return;
      roadview = new kakao.maps.Roadview($("roadview"));
      roadviewClient = new kakao.maps.RoadviewClient();
    }
'''
    new = '''    // MW_ROADVIEW_MAPWALKER_V64
    function createRoadviewWalkerV64(position){
      const root=document.createElement("div");
      root.style.cssText="position:relative;width:46px;height:46px;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(15,23,42,.28));";
      const cone=document.createElement("div");
      cone.style.cssText="position:absolute;left:50%;top:-21px;width:25px;height:32px;transform:translateX(-50%) rotate(0deg);transform-origin:50% 37px;background:rgba(37,99,235,.48);clip-path:polygon(50% 0,100% 100%,50% 77%,0 100%);";
      const halo=document.createElement("div");
      halo.style.cssText="position:absolute;left:50%;top:50%;width:30px;height:30px;transform:translate(-50%,-50%);border-radius:999px;background:rgba(37,99,235,.16);border:2px solid rgba(37,99,235,.72);";
      const dot=document.createElement("div");
      dot.style.cssText="position:absolute;left:50%;top:50%;width:12px;height:12px;transform:translate(-50%,-50%);border-radius:999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 1px rgba(37,99,235,.25);";
      root.appendChild(cone); root.appendChild(halo); root.appendChild(dot);
      const overlay=new kakao.maps.CustomOverlay({position,content:root,xAnchor:.5,yAnchor:.5,zIndex:99});
      return {
        setMap(targetMap){overlay.setMap(targetMap);},
        setPosition(nextPosition){if(nextPosition) overlay.setPosition(nextPosition);},
        setAngle(angle){const pan=((Number(angle)||0)%360+360)%360;cone.style.transform=`translateX(-50%) rotate(${pan}deg)`;}
      };
    }
    function syncRoadviewWalkerV64(){
      if(!roadview || !map) return;
      const position=roadview.getPosition?.() || map.getCenter();
      if(!roadviewWalkerV64) roadviewWalkerV64=createRoadviewWalkerV64(position);
      roadviewWalkerV64.setPosition(position);
      if(roadviewOn) roadviewWalkerV64.setMap(map);
      const viewpoint=roadview.getViewpoint?.();
      if(viewpoint) roadviewWalkerV64.setAngle(viewpoint.pan);
    }
    function ensureRoadview(){
      if (roadview && roadviewClient) return;
      roadview = new kakao.maps.Roadview($("roadview"));
      roadviewClient = new kakao.maps.RoadviewClient();
      kakao.maps.event.addListener(roadview,"init",syncRoadviewWalkerV64);
      kakao.maps.event.addListener(roadview,"viewpoint_changed",()=>{
        if(!roadviewWalkerV64) syncRoadviewWalkerV64();
        const viewpoint=roadview.getViewpoint?.();
        if(viewpoint && roadviewWalkerV64) roadviewWalkerV64.setAngle(viewpoint.pan);
      });
      kakao.maps.event.addListener(roadview,"position_changed",()=>{
        const position=roadview.getPosition?.();
        if(!position) return;
        if(!roadviewWalkerV64) syncRoadviewWalkerV64();
        roadviewWalkerV64?.setPosition(position);
        if(roadviewOn) roadviewWalkerV64?.setMap(map);
        map.setCenter(position);
      });
    }
'''
    if old not in text:
        raise SystemExit(f"{path}: ensureRoadview anchor missing")
    text = text.replace(old, new, 1)

    pattern = re.compile(r'''    function setRoadviewOn\(on\)\{[\s\S]*?^    \}\n    toggleRoadviewBtn\.addEventListener\("click", \(\)=> setRoadviewOn\(!roadviewOn\)\);''', re.MULTILINE)
    replacement = '''    function setRoadviewOn(on){
      roadviewOn=!!on;
      toggleRoadviewBtn.textContent = roadviewOn ? "로드뷰 종료" : "로드뷰";
      roadviewHintEl.style.display = roadviewOn ? "inline-flex" : "none";
      if (!roadviewOn){
        mapWrapEl.classList.remove("roadview-open");
        try { map.removeOverlayMapTypeId(kakao.maps.MapTypeId.ROADVIEW); } catch {}
        roadviewWalkerV64?.setMap(null);
        if (rvClick) kakao.maps.event.removeListener(map, "click", rvClick);
        rvClick=null;
        return;
      }
      try { map.addOverlayMapTypeId(kakao.maps.MapTypeId.ROADVIEW); } catch {}
      roadviewWalkerV64?.setMap(map);
      rvClick = (e)=> e?.latLng && setRoadviewAt(e.latLng);
      kakao.maps.event.addListener(map, "click", rvClick);
    }
    toggleRoadviewBtn.addEventListener("click", ()=> setRoadviewOn(!roadviewOn));'''
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"{path}: setRoadviewOn block missing")
    path.write_text(text, encoding="utf-8")
    return text


zip_path = Path("public/zipcode_search")
patch_zipcode(zip_path)
route_path = Path("public/coupangRouteMap.html")
route_text = patch_route(route_path)
Path("coupangRouteMap.html").write_text(route_text, encoding="utf-8")

for path in [zip_path, route_path, Path("coupangRouteMap.html")]:
    final = path.read_text(encoding="utf-8")
    if "MW_ROADVIEW_MAPWALKER_V64" not in final:
        raise SystemExit(f"{path}: patch marker missing")
    if "viewpoint_changed" not in final or "position_changed" not in final:
        raise SystemExit(f"{path}: roadview synchronization missing")
