from pathlib import Path

# trigger: 2026-08-15
path = Path('public/coupang_camp_map')
text = path.read_text(encoding='utf-8')

def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    text = text.replace(old, new, 1)

replace_once(
    '          <button id="mapType" class="btn" type="button">위성</button>\n'
    '          <button id="current" class="btn" type="button">내 위치</button>',
    '          <button id="mapType" class="btn" type="button">위성</button>\n'
    '          <button id="roadview" class="btn" type="button">로드뷰</button>\n'
    '          <button id="current" class="btn" type="button">내 위치</button>',
    'roadview button'
)

replace_once(
    '        mapType: $("#mapType"),\n'
    '        current: $("#current"),',
    '        mapType: $("#mapType"),\n'
    '        roadview: $("#roadview"),\n'
    '        current: $("#current"),',
    'roadview dom reference'
)

replace_once(
    '        isRoadmap: true,\n'
    '        selectedTypes: new Set()',
    '        isRoadmap: true,\n'
    '        isRoadviewOn: false,\n'
    '        roadviewOverlay: null,\n'
    '        selectedTypes: new Set()',
    'roadview state'
)

replace_once(
    '        state.geocoder = new kakao.maps.services.Geocoder();',
    '        state.geocoder = new kakao.maps.services.Geocoder();\n\n'
    '        try {\n'
    '          state.roadviewOverlay = new kakao.maps.RoadviewOverlay();\n'
    '        } catch (error) {\n'
    '          console.warn("로드뷰 오버레이 초기화 실패", error);\n'
    '          state.roadviewOverlay = null;\n'
    '        }',
    'roadview initialization'
)

anchor = '        dom.current.addEventListener("click", () => {'
insert = '''        dom.roadview.addEventListener("click", () => {
          if (!state.map || !state.roadviewOverlay) {
            showToast("로드뷰 오버레이를 사용할 수 없습니다.", true);
            return;
          }

          state.isRoadviewOn = !state.isRoadviewOn;
          state.roadviewOverlay.setMap(state.isRoadviewOn ? state.map : null);
          dom.roadview.classList.toggle("primary", state.isRoadviewOn);
          showToast(state.isRoadviewOn ? "로드뷰 도로 표시 ON" : "로드뷰 도로 표시 OFF");
        });

'''
if text.count(anchor) != 1:
    raise SystemExit(f'roadview click anchor: expected exactly 1, found {text.count(anchor)}')
text = text.replace(anchor, insert + anchor, 1)

path.write_text(text, encoding='utf-8')

final = path.read_text(encoding='utf-8')
for check in [
    'id="roadview" class="btn" type="button">로드뷰</button>',
    'roadview: $("#roadview")',
    'isRoadviewOn: false',
    'roadviewOverlay: null',
    'new kakao.maps.RoadviewOverlay()',
    'dom.roadview.addEventListener("click"',
    'state.roadviewOverlay.setMap(state.isRoadviewOn ? state.map : null)',
    '로드뷰 도로 표시 ON',
]:
    if check not in final:
        raise SystemExit(f'missing validation anchor: {check}')
