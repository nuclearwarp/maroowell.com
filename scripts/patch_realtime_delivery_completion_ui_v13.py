from pathlib import Path
import re


def rep(s, old, new, label):
    if old not in s:
        raise SystemExit(f"missing target: {label}")
    return s.replace(old, new, 1)


# Backend: overall display completion follows delivery completion only.
p = Path("workers/meta-collector/entry.js")
s = p.read_text(encoding="utf-8")
s = rep(
    s,
    'const allDone = deliveryDone && (batch.wave === "WAVE1" || returnDone) && freshbagDone;',
    'const allDone = deliveryDone;',
    "allDone",
)
s = rep(
    s,
    'delivery_completed_at: prev?.delivery_completed_at || (deliveryDone && (batch.wave === "WAVE1" || returnDone) ? now : null),',
    'delivery_completed_at: prev?.delivery_completed_at || (deliveryDone ? now : null),',
    "delivery_completed_at",
)
p.write_text(s, encoding="utf-8")

# Frontend: keep existing structure, improve readability, colors, route detail and progress bars.
p = Path("public/realtime")
s = p.read_text(encoding="utf-8")
s = rep(
    s,
    'const rawRoutes=(Array.isArray(src.scheduled_routes)&&src.scheduled_routes.length?src.scheduled_routes:src.actual_routes)||[];\n    const routes=uniq(rawRoutes.map(subRoute).filter(Boolean));',
    'const rawRoutes=(Array.isArray(src.actual_routes)&&src.actual_routes.length?src.actual_routes:src.scheduled_routes)||[];\n    const routes=uniq(rawRoutes.map(norm).filter(Boolean));',
    "route display",
)

old = re.search(r'function deliveryPanel\(cls,label,m\)\{.*?\n\}\nfunction collectionPanel\(cls,label,m,wave\)\{.*?\n\}', s, re.S)
if not old:
    raise SystemExit("metric functions not found")
new = r'''function clampRate(v){return Math.max(0,Math.min(100,Number(v||0)))}
function metricBar(cls,rate){return `<div class="metricBar ${cls}"><i style="width:${clampRate(rate)}%"></i></div>`}
function deliveryPanel(cls,label,m){
  if(cls==="freshDelivery"){
    const rate=m?.hasData?m.rate:0;
    return `<div class="metricPanel ${cls}">
      <div class="k">${label}</div>
      <div class="rate">${m?.hasData?pct(m.rate):"-"}</div>
      ${metricBar(cls,rate)}
      <div class="detail">${m?.hasData?("남음 "+num(m.remaining)+" / 전체 "+num(m.total)):"데이터 없음"}<br>20시 PDD</div>
    </div>`;
  }
  return `<div class="metricPanel ${cls}">
    <div class="k">${label}</div>
    <div class="rate">${pct(m.rate)}</div>
    ${metricBar(cls,m.rate)}
    <div class="detail">완료 ${num(m.completed)} / ${num(m.total)}<br>미배송 ${num(m.impossible)}<br>남음 ${num(m.remaining)}</div>
  </div>`;
}
function collectionPanel(cls,label,m,wave){
  if(cls==="return"&&isNight(wave))return "";
  const detail=cls==="return"
    ? `<div class="detail">회수 ${num(m.collected)}<br>미회수 ${num(m.uncollected)}<br>회수대기 ${num(m.assigned)}${m.absent?`<br>부재 ${num(m.absent)}`:""}</div>`
    : `<div class="detail">회수 ${num(m.collected)}<br>미회수 ${num(m.uncollected)}<br>회수대기 ${num(m.assigned)}</div>`;
  return `<div class="metricPanel ${cls}">
    <div class="k">${label}</div>
    <div class="dual"><span>완료율 <b>${pct(m.completionRate)}</b></span><span>회수율 <b>${pct(m.collectionRate)}</b></span></div>
    ${metricBar(cls,m.completionRate)}
    ${detail}
  </div>`;
}'''
s = s[:old.start()] + new + s[old.end():]

s = rep(
    s,
    '<div class="driverScore"><b>${pct(r.delivery.rate)}</b><small>배송 완료율</small></div>',
    '<div class="driverScore"><b>${pct(r.delivery.rate)}</b><small>배송 완료율</small><div class="scoreBar"><i style="width:${clampRate(r.delivery.rate)}%"></i></div></div>',
    "driver score bar",
)

css = r'''
/* ===== realtime readability + progress bars v13 ===== */
:root{--blue:#38bdf8;--fresh:#22c55e;--return:#6366f1;--olive:#84cc16}
.field label,.caption,.status,.campMeta,.routeLabel,.timeMeta,.selectionHint{font-size:12px}
.pill,.autoBtn,.copyBtn,.summaryBox .sub,.btn{font-size:12px}
.summaryBox .label{font-size:12px}.summaryBox .value{font-size:22px}
.summaryBox.delivery .value,.summaryBox.freshDelivery .value{font-size:20px}
.summaryBox.return .value,.summaryBox.fresh .value{font-size:18px}
.campName,.driverName{font-size:16px}.campOps{font-size:12px}
.metricPanel{padding:10px 11px;border:1px solid rgba(148,163,184,.16)}
.metricPanel.delivery{background:#f0f9ff}.metricPanel.freshDelivery{background:#f0fdf4}.metricPanel.return{background:#eef2ff}.metricPanel.fresh{background:#f7fee7}
.metricPanel .k{font-size:12px;font-weight:650}.metricPanel .rate{font-size:16px;font-weight:700}
.metricPanel .detail{font-size:12.5px;line-height:1.5}.metricPanel .dual{font-size:12px}.metricPanel .dual b{font-size:13.5px}
.driverCamp,.waveBadge{font-size:11px}.driverScore{min-width:102px}.driverScore b{font-size:16px}.driverScore small{font-size:11px}
.timeMeta{font-size:12px}.routeLabel{font-size:12.5px;color:#475569;font-weight:600}.missLine{font-size:12px}.flag{font-size:11px}.warn{font-size:11.5px}
.metricBar,.scoreBar{height:7px;margin-top:7px;border-radius:999px;background:#e2e8f0;overflow:hidden}
.metricBar i,.scoreBar i{display:block;height:100%;border-radius:inherit;transition:width .18s ease}
.metricBar.delivery i,.scoreBar i{background:var(--blue)}.metricBar.freshDelivery i{background:var(--fresh)}.metricBar.return i{background:var(--return)}.metricBar.fresh i{background:var(--olive)}
.scoreBar{width:100%;height:6px}
/* ===== realtime readability + progress bars v13 end ===== */
'''
if "realtime readability + progress bars v13" not in s:
    s = s.replace("</style>", css + "\n</style>", 1)

s = s.replace('mw-realtime-live-v12', 'mw-realtime-live-v13', 1).replace('content="12"', 'content="13"', 1)
p.write_text(s, encoding="utf-8")

print("patched realtime collector/frontend v13")
# trigger 2026-09-16
