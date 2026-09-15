from pathlib import Path

src = Path('public/realtime').read_text(encoding='utf-8')
s = src

old = '''  if(cls==="freshDelivery"){
    return `<div class="metricPanel ${cls}">
      <div class="k">${label}</div>
      <div class="rate">${m?.hasData?pct(m.rate):"-"}</div>
      <div class="detail">20시 PDD</div>
    </div>`;
  }'''
new = '''  if(cls==="freshDelivery"){
    return `<div class="metricPanel ${cls}">
      <div class="k">${label}</div>
      <div class="rate">${m?.hasData?pct(m.rate):"-"}</div>
      <div class="detail">${m?.hasData?("남음 "+num(m.remaining)+" / 전체 "+num(m.total)):"데이터 없음"}<br>20시 PDD</div>
    </div>`;
  }'''
if old not in s:
    raise SystemExit('fresh delivery panel anchor not found')
s = s.replace(old, new, 1)

old2 = '''  $("freshDeliverySub").textContent=onlyNight?"야간 미조회":"20시 PDD";'''
new2 = '''  $("freshDeliverySub").innerHTML=onlyNight
    ?"야간 미조회"
    :(!a.freshDelivery.hasData
      ?"데이터 없음"
      :`남음 ${num(a.freshDelivery.remaining)} / 전체 ${num(a.freshDelivery.total)}<br>20시 PDD`);'''
if old2 not in s:
    raise SystemExit('fresh summary anchor not found')
s = s.replace(old2, new2, 1)

s = s.replace('<meta name="mw-realtime-live-v11" content="11">','<meta name="mw-realtime-live-v12" content="12">',1)

if not s.startswith('<!doctype html>') or not s.rstrip().endswith('</html>'):
    raise SystemExit('invalid realtime html')
if '남음 "+num(m.remaining)+" / 전체 "+num(m.total)' not in s:
    raise SystemExit('fresh detail output missing')
if '남음 ${num(a.freshDelivery.remaining)} / 전체 ${num(a.freshDelivery.total)}' not in s:
    raise SystemExit('fresh summary output missing')

Path('realtime_full_fresh_remaining_v12.txt').write_text(s, encoding='utf-8')
