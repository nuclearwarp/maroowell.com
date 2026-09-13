from pathlib import Path
import re

p = Path('public/home')
s = p.read_text(encoding='utf-8')

if 'mw-home-backend-live-v1' in s:
    print('Home backend live patch already applied')
    raise SystemExit(0)


def exact(old, new, name):
    global s
    if old not in s:
        raise RuntimeError(f'missing exact target: {name}')
    s = s.replace(old, new, 1)


def regex(pattern, new, name):
    global s
    ns, n = re.subn(pattern, lambda m: new, s, count=1, flags=re.S)
    if n != 1:
        raise RuntimeError(f'missing regex target: {name} ({n})')
    s = ns

# CSS / layout
exact(
    '.waveToggle{height:46px;display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line2);border-radius:11px;overflow:hidden;background:#f8fafc}.waveBtn{border:0;background:transparent;color:#64748b;font-size:13px;font-weight:950;cursor:pointer}.waveBtn.day.active{background:var(--day);color:#fff}.waveBtn.night.active{background:var(--night);color:#fff}',
    '.liveMode{height:46px;display:flex;align-items:center;padding:0 13px;border:1px solid var(--line2);border-radius:11px;background:#f8fafc;color:#17364a;font-size:12px;font-weight:950}.waveToggle{height:46px;display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line2);border-radius:11px;overflow:hidden;background:#f8fafc}.waveBtn{border:0;background:transparent;color:#64748b;font-size:13px;font-weight:950;cursor:pointer}.waveBtn.all.active{background:var(--navy);color:#fff}.waveBtn.day.active{background:var(--day);color:#fff}.waveBtn.night.active{background:var(--night);color:#fff}',
    'wave controls css')
exact(
    '.campGrid,.driverGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
    '.campGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.driverGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
    'driver three columns')
exact(
    '.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:9px}',
    '.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:9px}.driverCard .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}',
    'compact driver metrics')
exact(
    '.driverCamp{display:inline-flex;margin-right:6px;padding:3px 7px;border-radius:999px;background:#eef3f5;color:#435b68;font-size:9px;font-weight:900;vertical-align:2px}',
    '.driverCamp{display:inline-flex;margin-right:5px;padding:3px 7px;border-radius:999px;background:#eef3f5;color:#435b68;font-size:9px;font-weight:900;vertical-align:2px}.waveBadge{display:inline-flex;margin-right:5px;padding:3px 7px;border-radius:999px;font-size:9px;font-weight:950;vertical-align:2px}.waveBadge.day{background:#fff6df;color:#9a5b00}.waveBadge.night{background:#f2ecff;color:#6d28d9}',
    'wave badges')
exact(
    '@media(max-width:1320px){.summaryGrid{grid-template-columns:repeat(5,1fr)}.metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:980px){.controls{grid-template-columns:1fr 1fr}.actions{grid-column:1/-1}.summaryGrid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.wrap{padding:7px}.topbar{top:2px}.pill.user{display:none}.controls{grid-template-columns:1fr}.actions{grid-column:auto}.actions .btn{width:100%}.summaryGrid{grid-template-columns:repeat(2,1fr)}.campGrid,.driverGrid{grid-template-columns:1fr}.metrics{grid-template-columns:1fr}.card{padding:11px;border-radius:15px}.copyBtn{padding:0 8px}.selectionHint{display:none}}',
    '@media(max-width:1320px){.summaryGrid{grid-template-columns:repeat(5,1fr)}.campCard .metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:1120px){.driverGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:980px){.controls{grid-template-columns:1fr 1fr}.actions{grid-column:1/-1}.summaryGrid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.wrap{padding:7px}.topbar{top:2px}.pill.user{display:none}.controls{grid-template-columns:1fr}.actions{grid-column:auto}.actions .btn{width:100%}.summaryGrid{grid-template-columns:repeat(2,1fr)}.campGrid,.driverGrid{grid-template-columns:1fr}.metrics,.driverCard .metrics{grid-template-columns:1fr}.card{padding:11px;border-radius:15px}.copyBtn{padding:0 8px}.selectionHint{display:none}}',
    'responsive css')

# Controls / labels
regex(
    r'    <div class="field"><label for="scheduleDate">일자</label><input id="scheduleDate" class="dateInput" type="date"></div>\n    <div class="field"><label>배송 구분</label><div class="waveToggle">.*?</div></div>\n    <div class="field"><label>자동 조회</label><div class="autoRow">.*?</div></div>\n    <div class="actions"><button id="queryBtn" class="btn primary" type="button">조회</button></div>',
    '''    <div class="field"><label>조회 기준</label><div class="liveMode">현재 배송중 · 백엔드 자동 수집</div><input id="scheduleDate" type="hidden"></div>
    <div class="field"><label>표시 구분</label><div class="waveToggle"><button class="waveBtn all active" data-wave="ALL" type="button">전체</button><button class="waveBtn day" data-wave="WAVE2" type="button">주간</button><button class="waveBtn night" data-wave="WAVE1" type="button">야간</button></div></div>
    <div class="field"><label>자동 새로고침</label><div class="autoRow"><button class="autoBtn" data-min="0" type="button">끔</button><button class="autoBtn active" data-min="1" type="button">1분</button><button class="autoBtn" data-min="3" type="button">3분</button><button class="autoBtn" data-min="5" type="button">5분</button><button class="autoBtn" data-min="10" type="button">10분</button><button class="autoBtn" data-min="15" type="button">15분</button><button class="autoBtn" data-min="30" type="button">30분</button></div></div>
    <div class="actions"><button id="queryBtn" class="btn primary" type="button">새로고침</button></div>''',
    'controls markup')
exact('<div class="sectionHead"><h2 id="summaryTitle">전체 주간 현황</h2>', '<div class="sectionHead"><h2 id="summaryTitle">전체 실시간 현황</h2>', 'summary title')
exact('<div class="summaryBox"><div class="label">출근 예정</div><div id="attendanceCount" class="value">-</div><div class="sub">스케줄 기준</div></div>', '<div class="summaryBox"><div class="label">배송중 기사</div><div id="attendanceCount" class="value">-</div><div class="sub">진행중만 표시</div></div>', 'live worker box')
exact('<div class="summaryBox"><div class="label">META 기사</div><div id="workerCount" class="value">-</div><div class="sub">조회 응답 기준</div></div>', '<div class="summaryBox"><div class="label">주간 / 야간</div><div id="workerCount" class="value">-</div><div class="sub">자동 수집 기준</div></div>', 'wave count box')

# State / helpers
exact(
    'const S={sb:null,wave:"WAVE2",ctx:{vendorCodes:[],camps:[]},campMap:new Map(),busy:false,auto:Number(localStorage.getItem("mwHomeAuto")||5),timer:null,metaTimer:null,metaConnected:false,camps:[],selected:new Set(),lastMetaStart:0,lastQueryAt:0};',
    'const S={sb:null,wave:"ALL",ctx:{vendorCodes:[],camps:[]},campMap:new Map(),busy:false,auto:Number(localStorage.getItem("mwHomeAuto")||1),timer:null,metaTimer:null,metaConnected:false,camps:[],batches:[],selected:new Set(),lastMetaStart:0,lastQueryAt:0};',
    'state')
exact(
    'const night=()=>S.wave==="WAVE1",workDate=()=>night()?addDays($("scheduleDate").value,1):$("scheduleDate").value,defaultDate=()=>{const x=new Date();if(night()&&x.getHours()<8)x.setDate(x.getDate()-1);return iso(x)},sleep=ms=>new Promise(r=>setTimeout(r,ms));',
    'const night=(wave=S.wave)=>wave==="WAVE1",waveLabel=wave=>wave==="WAVE1"?"야간":wave==="WAVE2"?"주간":"전체",workDate=()=>night()?addDays($("scheduleDate").value,1):$("scheduleDate").value,defaultDate=()=>iso(new Date()),sleep=ms=>new Promise(r=>setTimeout(r,ms));',
    'wave helpers')
exact(
    'function metaUI(ok){S.metaConnected=!!ok;const b=$("metaLoginBtn");if(ok){b.className="btn metaConnected";b.textContent="META 연결됨";b.disabled=false}else{b.className="btn primary";b.textContent="META 로그인";b.disabled=false}}',
    'function metaUI(ok,detail=""){S.metaConnected=!!ok;const b=$("metaLoginBtn");b.title=detail||"";b.disabled=false;if(ok){b.className="btn metaConnected";b.textContent="자동 수집 정상"}else{b.className="btn danger";b.textContent="수집 확인 필요"}}',
    'backend indicator')

anchor = 'function addCollection(a,b){for(const k of["total","completed","collected","uncollected","assigned","absent","remaining","finished"])a[k]=(a[k]||0)+(b[k]||0);a.completionRate=ratio((a.completed||0)+(a.uncollected||0),a.total);a.collectionRate=ratio(a.completed,a.total);a.rate=a.collectionRate}\n'
if anchor not in s:
    raise RuntimeError('missing mapper anchor')
mapper = r'''function backendDelivery(r,p="delivery"){const total=+r[`${p}_total`]||0,miss=+r[`${p}_assigned`]||0,scan=+r[`${p}_scanned`]||0,done=+r[`${p}_completed`]||0,imp=+r[`${p}_impossible`]||0,pdd=+r[`${p}_pdd_miss`]||0,rate=Number(r[`${p}_complete_rate`]??ratio(done,total));return{total,misscan:miss,remaining:scan,completed:done,impossible:imp,pddMiss:pdd,rate}}
function backendCollection(r,p,includeAbsent=false){const assigned=+r[`${p}_pending`]||0,collected=+r[`${p}_collected`]||0,uncollected=+(r[`${p}_uncollected`]??r[`${p}_uncollected_raw`]??0)||0,absent=includeAbsent?(+r[`${p}_absent_raw`]||0):0,total=+r[`${p}_total`]||(assigned+collected+uncollected),finished=collected+uncollected,completionRate=Number(r[`${p}_attempt_rate`]??ratio(finished,total)),collectionRate=Number(r[`${p}_collection_rate`]??ratio(collected,total));return{total,completed:collected,collected,uncollected,assigned,absent,remaining:assigned,finished,completionRate,collectionRate,rate:collectionRate}}
function buildBackendCamps(rows,batches){const bm=new Map((batches||[]).map(b=>[b.id,b])),groups=new Map();for(const src of rows||[]){const b=bm.get(src.batch_id)||{},wave=String(src.wave||b.wave||"").toUpperCase();if(S.wave!=="ALL"&&wave!==S.wave)continue;const activity=(+src.delivery_scanned||0)+(+src.delivery_completed||0)+(+src.delivery_impossible||0)+(+src.delivery_pdd_miss||0);if((+src.delivery_total||0)<=0||src.all_done===true||activity<=0)continue;const name=cleanCampName(src.camp_name||b.camp_name||"",src.camp_code||b.camp_code||""),key=`${name}|${wave}`;let g=groups.get(key);if(!g){g={key,code:src.camp_code||b.camp_code||"",name,wave,totals:{delivery:blankDelivery(),freshDelivery:blankDelivery(),returns:collection(),fresh:collection()},rows:[],workers:0,attendance:0,status:b.status||"collecting",lastPolledAt:b.last_polled_at||null};groups.set(key,g)}const d=backendDelivery(src,"delivery"),fd=backendDelivery(src,"fresh_delivery"),ret=backendCollection(src,"return",true),fb=backendCollection(src,"freshbag",false),rawRoutes=(Array.isArray(src.scheduled_routes)&&src.scheduled_routes.length?src.scheduled_routes:src.actual_routes)||[],routes=uniq(rawRoutes.map(subRoute).filter(Boolean)),extra=uniq((src.extra_routes||[]).map(subRoute).filter(Boolean)),warns=extra.length?[`추가 라우트 ${extra.join(", ")}`]:[];addDelivery(g.totals.delivery,d);addDelivery(g.totals.freshDelivery,fd);addCollection(g.totals.returns,ret);addCollection(g.totals.fresh,fb);g.rows.push({campKey:key,camp:name,wave,driver:String(src.driver_name||src.coupang_id||"담당 확인").trim(),routes,delivery:d,freshDelivery:fd,returns:ret,fresh:fb,status:extra.length?"external":"ok",warns});g.workers++;g.attendance++}return[...groups.values()]}
'''
s = s.replace(anchor, anchor + mapper, 1)

# Wave-aware metric cards
exact(
    'function collectionPanel(cls,label,m){if(cls==="return"&&night())return"";return`<div class="metricPanel ${cls}"><div class="k">${label}</div><div class="dual"><span>완료율 <b>${pct(m.completionRate)}</b></span><span>회수율 <b>${pct(m.collectionRate)}</b></span></div><div class="detail">회수 ${num(m.collected)} · 미회수 ${num(m.uncollected)} · 남음 ${num(m.assigned)}${m.absent?` · 부재 ${num(m.absent)}`:""}</div></div>`}\nfunction metricsHtml(x){return`${deliveryPanel("delivery","배송",x.delivery)}${night()?"":deliveryPanel("freshDelivery","신선 20시",x.freshDelivery)}${collectionPanel("return","반품",x.returns)}${collectionPanel("fresh","프백",x.fresh)}`}',
    'function collectionPanel(cls,label,m,wave){if(cls==="return"&&night(wave))return"";return`<div class="metricPanel ${cls}"><div class="k">${label}</div><div class="dual"><span>완료율 <b>${pct(m.completionRate)}</b></span><span>회수율 <b>${pct(m.collectionRate)}</b></span></div><div class="detail">회수 ${num(m.collected)} · 미회수 ${num(m.uncollected)} · 남음 ${num(m.assigned)}${m.absent?` · 부재 ${num(m.absent)}`:""}</div></div>`}\nfunction metricsHtml(x){const w=x.wave||S.wave;return`${deliveryPanel("delivery","배송",x.delivery)}${night(w)?"":deliveryPanel("freshDelivery","신선 20시",x.freshDelivery)}${collectionPanel("return","반품",x.returns,w)}${collectionPanel("fresh","프백",x.fresh,w)}`}',
    'metric helpers')

# Renders
regex(
    r'function renderSummary\(\)\{.*?\}\nfunction renderCamps\(\)',
    r'''function renderSummary(){const a=aggregate(S.camps),rows=S.camps.flatMap(c=>c.rows),dayCount=rows.filter(r=>r.wave==="WAVE2").length,nightCount=rows.filter(r=>r.wave==="WAVE1").length,onlyNight=S.wave==="WAVE1",returnBox=document.querySelector(".summaryBox.return"),freshDeliveryBox=document.querySelector(".summaryBox.freshDelivery");if(returnBox)returnBox.classList.toggle("hidden",onlyNight);if(freshDeliveryBox)freshDeliveryBox.classList.toggle("hidden",onlyNight);$("summaryTitle").textContent=S.wave==="ALL"?"전체 실시간 현황":`전체 ${waveLabel(S.wave)} 현황`;$("campCount").textContent=num(new Set(S.camps.map(c=>c.name)).size);$("attendanceCount").textContent=num(a.workers);$("workerCount").textContent=S.wave==="ALL"?`${dayCount} / ${nightCount}`:num(a.workers);$("deliveryTotal").textContent=num(a.delivery.total);$("deliveryRate").textContent=pct(a.delivery.rate);$("deliverySub").textContent=`완료 ${num(a.delivery.completed)} / ${num(a.delivery.total)} · 남음 ${num(a.delivery.remaining)}`;$("freshDeliveryRate").textContent=onlyNight?"-":pct(a.freshDelivery.rate);$("freshDeliverySub").textContent=onlyNight?"야간 미조회":`완료 ${num(a.freshDelivery.completed)} / ${num(a.freshDelivery.total)} · 남음 ${num(a.freshDelivery.remaining)}`;$("returnRate").innerHTML=`<div class="stackRate"><div>완료율 ${pct(a.returns.completionRate)}</div><div>회수율 ${pct(a.returns.collectionRate)}</div></div>`;$("returnSub").textContent=`회수 ${num(a.returns.collected)} · 미회수 ${num(a.returns.uncollected)} · 남음 ${num(a.returns.assigned)}${a.returns.absent?` · 부재 ${num(a.returns.absent)}`:""}`;$("freshRate").innerHTML=`<div class="stackRate"><div>완료율 ${pct(a.fresh.completionRate)}</div><div>회수율 ${pct(a.fresh.collectionRate)}</div></div>`;$("freshSub").textContent=`회수 ${num(a.fresh.collected)} · 미회수 ${num(a.fresh.uncollected)} · 남음 ${num(a.fresh.assigned)}`;$("misscanTotal").textContent=num(a.delivery.misscan);const q=S.lastQueryAt?new Date(S.lastQueryAt):null;$("summaryCaption").textContent=q?`${waveLabel(S.wave)} · ${q.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`:"조회 전"}
function renderCamps()''',
    'summary render')
regex(
    r'function renderCamps\(\)\{.*?\}\nfunction renderDrivers\(\)',
    r'''function renderCamps(){const body=$("campBody");$("campCaption").textContent=`${S.camps.length}개 운행 단위 · 클릭해 기사 필터`;if(!S.camps.length){body.className="empty";body.textContent="현재 배송중인 캠프가 없습니다.";return}body.className="campGrid";body.innerHTML=S.camps.slice().sort((a,b)=>a.totals.delivery.rate-b.totals.delivery.rate||a.name.localeCompare(b.name,"ko")||a.wave.localeCompare(b.wave)).map(c=>`<article class="campCard ${S.selected.has(c.key)?"selected":""}" data-camp-key="${esc(c.key)}"><div class="campTop"><div><div class="campName">${esc(c.name)} <span class="waveBadge ${night(c.wave)?"night":"day"}">${waveLabel(c.wave)}</span></div><div class="campMeta">배송중 ${num(c.workers)}명 · 배송 ${num(c.totals.delivery.total)}건</div></div></div><div class="metrics">${metricsHtml({...c.totals,wave:c.wave})}</div>${c.totals.delivery.misscan?`<div class="missLine">미스캔 ${num(c.totals.delivery.misscan)}건</div>`:""}</article>`).join("");body.querySelectorAll(".campCard").forEach(el=>el.addEventListener("click",()=>{const k=el.dataset.campKey;S.selected.has(k)?S.selected.delete(k):S.selected.add(k);renderCamps();renderDrivers()}))}
function renderDrivers()''',
    'camp render')
regex(
    r'function renderDrivers\(\)\{.*?\}\nfunction renderAll\(\)',
    r'''function renderDrivers(){const rows=S.camps.flatMap(c=>c.rows).filter(r=>!S.selected.size||S.selected.has(r.campKey)).sort((a,b)=>a.delivery.rate-b.delivery.rate||b.delivery.misscan-a.delivery.misscan||a.camp.localeCompare(b.camp,"ko")||a.driver.localeCompare(b.driver,"ko"));const mode=S.wave==="ALL"?"주간·야간 통합":waveLabel(S.wave);$("driverCaption").textContent=S.selected.size?`${rows.length}명 · ${[...S.selected].map(x=>x.split("|")[0]).join(", ")} · ${mode} · 완료율 낮은 순`:`${rows.length}명 · 전체 캠프 · ${mode} · 완료율 낮은 순`;const body=$("driverBody");if(!rows.length){body.className="empty";body.textContent="현재 배송중인 기사가 없습니다.";return}body.className="driverGrid";body.innerHTML=rows.map(r=>`<article class="driverCard ${r.status}"><div class="driverTop"><div><div class="driverName"><span class="driverCamp">${esc(r.camp)}</span><span class="waveBadge ${night(r.wave)?"night":"day"}">${waveLabel(r.wave)}</span>${esc(r.driver)}</div><div class="routeLabel">${esc(r.routes.join(", ")||"라우트 없음")}</div></div><div class="driverScore"><b>${pct(r.delivery.rate)}</b><small>배송 완료율</small></div></div><div class="metrics">${metricsHtml(r)}</div>${r.delivery.misscan?`<div class="missLine">미스캔 ${num(r.delivery.misscan)}건</div>`:""}${r.warns.length?`<div class="warn ${r.status==="external"?"red":""}">${esc(r.warns.join("\n"))}</div>`:""}</article>`).join("")}
function renderAll()''',
    'driver render')

# Query Supabase backend instead of browser META bridge
regex(
    r'async function queryAll\(\)\{.*?\}\nfunction restartAuto\(\)',
    r'''async function queryAll(){if(S.busy)return;setBusy(true);try{const activeStatuses=["collecting","completion_candidate","overdue","error"],{data:batches,error:be}=await S.sb.from("meta_realtime_batch").select("id,schedule_date,meta_work_date,camp_code,camp_name,wave,status,worker_count,last_polled_at,next_poll_at,last_error,updated_at").in("status",activeStatuses).order("updated_at",{ascending:false});if(be)throw be;S.batches=batches||[];if(!S.batches.length){S.camps=[];S.selected.clear();S.lastQueryAt=Date.now();renderAll();metaUI(true,"진행중 배치 없음");setStatus("현재 진행중인 배송 배치가 없습니다.");restartAuto();return}const ids=S.batches.map(b=>b.id),{data:rows,error:re}=await S.sb.from("meta_realtime_current").select("batch_id,camp_code,camp_name,wave,coupang_id,driver_name,scheduled_routes,actual_routes,extra_routes,delivery_assigned,delivery_scanned,delivery_completed,delivery_impossible,delivery_pdd_miss,delivery_total,delivery_complete_rate,return_pending,return_collected,return_uncollected,return_uncollected_raw,return_absent_raw,return_total,return_attempt_rate,return_collection_rate,freshbag_pending,freshbag_collected,freshbag_uncollected,freshbag_total,freshbag_attempt_rate,freshbag_collection_rate,fresh_delivery_assigned,fresh_delivery_scanned,fresh_delivery_completed,fresh_delivery_impossible,fresh_delivery_pdd_miss,fresh_delivery_total,fresh_delivery_complete_rate,last_seen_at,all_done").in("batch_id",ids).gt("delivery_total",0);if(re)throw re;S.camps=buildBackendCamps(rows||[],S.batches);S.selected.clear();S.lastQueryAt=Date.now();renderAll();const visible=S.camps.reduce((n,c)=>n+c.rows.length,0),errors=S.batches.filter(b=>b.status==="error"),polls=S.batches.map(b=>String(b.last_polled_at||"")).filter(Boolean).sort(),lastPoll=polls.at(-1)||"",pollText=lastPoll?lastPoll.replace("T"," ").slice(11,19):"-";metaUI(errors.length===0,errors.length?errors.map(b=>`${b.camp_name} ${waveLabel(b.wave)}: ${b.last_error||"error"}`).join("\n"):`최근 수집 ${pollText}`);setStatus(`${S.wave==="ALL"?"주간·야간 통합":waveLabel(S.wave)} · 현재 배송중 <strong>${num(visible)}명</strong> · 백엔드 ${errors.length?`오류 ${errors.length}건`:"정상"} · 최근 수집 ${pollText}`,errors.length===S.batches.length)}catch(e){console.error(e);metaUI(false,String(e?.message||e));setStatus(`백엔드 조회 실패: ${esc(e?.message||String(e))}`,true)}finally{setBusy(false)}}
function restartAuto()''',
    'backend query')

# Captures / events / boot
old_stamp = 'stamp.textContent=`데이터 조회 기준 · 일자 ${$("scheduleDate").value||"-"} · ${night()?"야간":"주간"} · 조회시각 ${queryTime}`;'
if old_stamp in s:
    s = s.replace(old_stamp, 'stamp.textContent=`데이터 조회 기준 · 현재 배송중 · ${S.wave==="ALL"?"주간·야간 통합":waveLabel(S.wave)} · 조회시각 ${queryTime}`;', 1)
regex(
    r'function bind\(\)\{.*?\}\nasync function boot\(\)',
    r'''function bind(){$("scheduleDate").value=defaultDate();document.querySelectorAll(".waveBtn").forEach(b=>b.addEventListener("click",()=>{S.wave=b.dataset.wave;document.querySelectorAll(".waveBtn").forEach(x=>x.classList.toggle("active",x===b));queryAll()}));document.querySelectorAll(".autoBtn").forEach(b=>{const m=Number(b.dataset.min);b.classList.toggle("active",m===S.auto);b.addEventListener("click",()=>{S.auto=m;document.querySelectorAll(".autoBtn").forEach(x=>x.classList.toggle("active",x===b));restartAuto();setStatus(m?`자동 새로고침 ${m}분 간격으로 설정했습니다.`:"자동 새로고침을 껐습니다.")})});$("queryBtn").addEventListener("click",queryAll);$("metaLoginBtn").addEventListener("click",queryAll);$("logoutBtn").addEventListener("click",logout);document.querySelectorAll("[data-copy-section]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();copySection(b.dataset.copySection,b.dataset.copyName,b)}));document.addEventListener("keydown",e=>{if(e.key==="Escape"&&S.selected.size){S.selected.clear();renderCamps();renderDrivers();setStatus("캠프 선택을 모두 해제했습니다.")}})}
async function boot()''',
    'bind')
regex(
    r'async function boot\(\)\{.*?\}\nboot\(\);',
    r'''async function boot(){bind();try{if(!(await auth()))return;await loadCampMap();document.documentElement.style.visibility="visible";metaUI(true,"백엔드 연결 확인 중");await queryAll();restartAuto()}catch(e){document.documentElement.style.visibility="visible";$("userPill").className="pill err user";$("userPill").textContent="접근 불가";metaUI(false,String(e?.message||e));setStatus(esc(e?.message||String(e)),true);$("queryBtn").disabled=true}}
boot();''',
    'boot')

# Marker for idempotence / deployment checks
s = s.replace('</head>', '<meta name="mw-home-backend-live-v1" content="1">\n</head>', 1)
p.write_text(s, encoding='utf-8')
print('Home backend live patch applied')
