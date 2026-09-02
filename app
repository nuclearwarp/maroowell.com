<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#ffffff" />
  <meta name="robots" content="noindex,nofollow" />
  <title>마루웰 앱 테스트</title>
  <link rel="icon" href="/favicon.ico" />
  <style>
    @font-face{font-family:"MW";src:url("/assets/fonts/MungyeongGamhong.woff2") format("woff2");font-style:normal;font-weight:400;font-display:swap}
    :root{--card:#fff;--line:#dbe3ef;--text:#172033;--muted:#6b7688;--blue:#2563eb;--blue2:#1d4ed8;--green:#16803d;--shadow:0 14px 34px rgba(15,23,42,.07)}
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:linear-gradient(180deg,#f8faff,#f4f7fb);color:var(--text);font-family:"MW","Noto Sans KR",system-ui,-apple-system,sans-serif;font-weight:400}
    body{padding:max(16px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom))}
    .wrap{width:min(100%,520px);margin:0 auto}
    .hero{padding:25px 22px 22px;border:1px solid var(--line);border-radius:28px;background:#fff;box-shadow:var(--shadow)}
    .brand{display:flex;align-items:center;gap:13px}.brandIcon{width:52px;height:52px;border-radius:14px;object-fit:contain;background:#fff}
    .brand b{font-size:23px;font-weight:400;letter-spacing:-.035em}.brand small{display:block;margin-top:3px;color:#2563eb;font-size:11px;font-weight:400}
    .hero h1{margin:23px 0 7px;font-size:29px;font-weight:400;letter-spacing:-.045em;line-height:1.15}.hero p{margin:0;color:var(--muted);font-size:13px;font-weight:400;line-height:1.7}
    .badge{display:inline-flex;margin-top:17px;padding:7px 10px;border-radius:999px;background:#ecfdf3;border:1px solid #bbf7d0;color:#15803d;font-size:11px;font-weight:400}
    .card{margin-top:13px;padding:18px;border:1px solid var(--line);border-radius:22px;background:#fff;box-shadow:var(--shadow)}
    .row{display:flex;align-items:center;justify-content:space-between;gap:12px}.label{color:var(--muted);font-size:12px;font-weight:400}.value{font-size:14px;font-weight:400;text-align:right}.divider{height:1px;background:#edf1f6;margin:14px 0}
    .download{display:flex;align-items:center;justify-content:center;width:100%;height:56px;margin-top:16px;border:0;border-radius:16px;background:linear-gradient(180deg,#3475f7,var(--blue));color:#fff;text-decoration:none;font:inherit;font-size:16px;font-weight:400;box-shadow:0 9px 22px rgba(37,99,235,.18);cursor:pointer}.download:hover{background:linear-gradient(180deg,#2f6ee9,var(--blue2))}.download.disabled{pointer-events:none;background:#cbd5e1;color:#64748b;box-shadow:none}
    .subbtn{width:100%;height:43px;margin-top:8px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#334155;font:inherit;font-size:12px;font-weight:400;cursor:pointer}
    .status{margin-top:10px;text-align:center;color:var(--muted);font-size:11px;font-weight:400;line-height:1.5}.status.ok{color:var(--green)}.status.err{color:#b45309}
    h2{margin:0 0 13px;font-size:17px;font-weight:400}.steps{display:grid;gap:10px}.step{display:grid;grid-template-columns:31px 1fr;gap:10px}.num{width:31px;height:31px;border-radius:10px;background:#eff6ff;color:var(--blue);display:grid;place-items:center;font-size:12px;font-weight:400}.step b{display:block;font-size:13px;font-weight:400;margin:2px 0 3px}.step span{color:var(--muted);font-size:11px;font-weight:400;line-height:1.55}
    .changes{margin:0;padding:0;list-style:none;display:grid;gap:8px}.changes li{position:relative;padding-left:17px;color:#526071;font-size:12px;font-weight:400;line-height:1.55}.changes li:before{content:"";position:absolute;left:2px;top:.55em;width:6px;height:6px;border-radius:50%;background:var(--blue)}
    .notice{margin-top:13px;padding:13px 14px;border-radius:15px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;font-size:11px;font-weight:400;line-height:1.6}.notice b{font-weight:400}.footer{text-align:center;padding:18px 0 2px;color:#94a3b8;font-size:10px;font-weight:400}
  </style>
</head>
<body>
<main class="wrap">
  <section class="hero"><div class="brand"><img class="brandIcon" src="/favicon.ico" alt="마루웰"><div><b>마루웰</b><small>MAROOWELL ANDROID</small></div></div><h1>관리자 테스트 앱</h1><p>마루웰 Android 앱의 최신 테스트 버전을 설치하는 공개 페이지입니다. 이 페이지 자체는 로그인 없이 접근할 수 있습니다.</p><div class="badge">● INTERNAL TEST BUILD</div></section>
  <section class="card"><div class="row"><span class="label">최신 버전</span><span class="value" id="version">확인 중…</span></div><div class="divider"></div><div class="row"><span class="label">업데이트 일자</span><span class="value" id="updated">확인 중…</span></div><a id="download" class="download disabled" href="#" aria-disabled="true">APK 확인 중…</a><button id="refresh" class="subbtn" type="button">최신 버전 다시 확인</button><div id="status" class="status">최신 배포 정보를 확인하고 있습니다.</div><div class="notice">테스트용 앱입니다. Android에서 처음 설치할 때 브라우저의 <b>알 수 없는 앱 설치 허용</b>을 요구할 수 있습니다.</div></section>
  <section class="card"><h2>설치 방법</h2><div class="steps"><div class="step"><div class="num">1</div><div><b>Android 폰에서 이 페이지 열기</b><span>Chrome 또는 삼성 인터넷으로 maroowell.com/app 에 접속합니다.</span></div></div><div class="step"><div class="num">2</div><div><b>APK 다운로드</b><span>최신 버전 다운로드 버튼을 눌러 파일을 받습니다.</span></div></div><div class="step"><div class="num">3</div><div><b>설치 또는 업데이트</b><span>처음이면 설치, 같은 테스트 서명 앱이 있으면 업데이트로 진행합니다.</span></div></div></div></section>
  <section class="card"><h2>이번 테스트 변경사항</h2><ul id="changes" class="changes"><li>버전 정보를 불러오는 중입니다.</li></ul></section><div class="footer">© MAROOWELL · 관리자/내부 테스트 배포</div>
</main>
<script>
const $=id=>document.getElementById(id);
const FALLBACK_META={
  versionCode:49,
  versionName:'1.4.5',
  updatedAt:'2026-09-03',
  fileName:'Maroowell-1.4.5.apk',
  downloadUrl:'https://maroowell-app-download.brain-0f6.workers.dev/downloads/Maroowell-1.4.5.apk',
  changes:[
    '메뉴 아이콘 순환 교체',
    '클렌징 히스토리 카드와 우편번호 전체 조회 이동 개선',
    '마루웰 회수율을 정산월·월누적·주차별 일자·이미지 복사를 갖춘 네이티브 화면으로 변경'
  ]
};
const META_SOURCES=[
  '/app_version.json',
  'https://raw.githubusercontent.com/nuclearwarp/maroowell.com/main/public/app_version.json'
];
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function versionRank(meta){
  const code=Number(meta&&meta.versionCode);
  if(Number.isFinite(code)&&code>0)return code*1000000;
  const parts=String(meta&&meta.versionName||'').split('.').map(v=>Number(v)||0);
  return (parts[0]||0)*1000000000+(parts[1]||0)*1000000+(parts[2]||0)*1000;
}
async function fetchLatestMeta(){
  const candidates=[FALLBACK_META];
  await Promise.all(META_SOURCES.map(async source=>{
    try{
      const separator=source.includes('?')?'&':'?';
      const response=await fetch(source+separator+'t='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const meta=await response.json();
      if(meta&&meta.versionName)candidates.push(meta);
    }catch(_){}
  }));
  candidates.sort((a,b)=>versionRank(b)-versionRank(a));
  return candidates[0];
}
async function loadVersion(){
  const button=$('download'),status=$('status');
  button.classList.add('disabled');button.removeAttribute('download');button.href='#';button.textContent='APK 확인 중…';
  status.className='status';status.textContent='최신 배포 정보를 확인하고 있습니다.';
  try{
    const meta=await fetchLatestMeta();
    $('version').textContent=meta.versionName||'-';
    $('updated').textContent=meta.updatedAt||'-';
    const changes=Array.isArray(meta.changes)?meta.changes:[];
    $('changes').innerHTML=changes.length?changes.map(v=>'<li>'+escapeHtml(v)+'</li>').join(''):'<li>등록된 변경사항이 없습니다.</li>';
    if(!meta.downloadUrl)throw new Error('APK 경로 미설정');
    const filename=meta.fileName||('Maroowell-'+String(meta.versionName||'latest').replace(/-test$/,'')+'.apk');
    button.classList.remove('disabled');button.href=meta.downloadUrl;button.setAttribute('download',filename);button.textContent='최신 APK 다운로드';
    status.className='status ok';status.textContent='다운로드 가능 · '+filename;
  }catch(err){
    $('version').textContent='-';$('updated').textContent='-';$('changes').innerHTML='<li>버전 정보를 불러오지 못했습니다.</li>';
    button.textContent='다운로드 준비 중';status.className='status err';status.textContent='버전 정보를 확인하지 못했습니다.';
  }
}
$('refresh').addEventListener('click',loadVersion);loadVersion();
</script>
</body>
</html>
