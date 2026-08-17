<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#0f172a" />
  <meta name="robots" content="noindex,nofollow" />
  <title>마루웰 앱 테스트</title>
  <link rel="icon" href="/favicon.ico" />
  <style>
    @font-face{font-family:"MW";src:url("/assets/fonts/MungyeongGamhong.woff2") format("woff2");font-display:swap}
    :root{--bg:#f4f7fb;--card:#fff;--line:#dbe3ef;--text:#0f172a;--muted:#64748b;--blue:#2563eb;--blue2:#1d4ed8;--green:#16803d;--yellow:#fbbf24;--shadow:0 18px 45px rgba(15,23,42,.09)}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:linear-gradient(180deg,#eef5ff,#f8fafc 45%,#f4f7fb);color:var(--text);font-family:"MW","Noto Sans KR",system-ui,-apple-system,sans-serif}
    body{padding:max(16px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom))}
    .wrap{width:min(100%,520px);margin:0 auto}.hero{padding:28px 22px 24px;border-radius:28px;background:linear-gradient(145deg,#111827,#0f172a);color:#fff;box-shadow:0 20px 55px rgba(15,23,42,.22)}
    .brand{display:flex;align-items:center;gap:12px}.mark{width:48px;height:48px;border-radius:15px;background:linear-gradient(145deg,#facc15,#f59e0b);color:#111827;display:grid;place-items:center;font-weight:1000;font-size:23px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
    .brand b{font-size:23px;letter-spacing:-.04em}.brand small{display:block;margin-top:3px;color:#bfdbfe;font-size:11px}.hero h1{margin:25px 0 7px;font-size:31px;letter-spacing:-.055em;line-height:1.1}.hero p{margin:0;color:#cbd5e1;font-size:13px;line-height:1.65}
    .badge{display:inline-flex;margin-top:18px;padding:7px 10px;border-radius:999px;background:rgba(34,197,94,.14);border:1px solid rgba(134,239,172,.3);color:#bbf7d0;font-size:11px;font-weight:900}
    .card{margin-top:13px;padding:18px;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.96);box-shadow:var(--shadow)}
    .row{display:flex;align-items:center;justify-content:space-between;gap:12px}.label{color:var(--muted);font-size:12px;font-weight:850}.value{font-size:14px;font-weight:950;text-align:right}.divider{height:1px;background:#edf1f6;margin:14px 0}
    .download{display:flex;align-items:center;justify-content:center;width:100%;height:56px;margin-top:16px;border:0;border-radius:16px;background:linear-gradient(180deg,#3475f7,var(--blue));color:#fff;text-decoration:none;font:inherit;font-size:16px;font-weight:1000;box-shadow:0 10px 24px rgba(37,99,235,.24);cursor:pointer}.download:hover{background:linear-gradient(180deg,#2f6ee9,var(--blue2))}.download.disabled{pointer-events:none;background:#cbd5e1;color:#64748b;box-shadow:none}
    .subbtn{width:100%;height:43px;margin-top:8px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#334155;font:inherit;font-size:12px;font-weight:900;cursor:pointer}
    .status{margin-top:10px;text-align:center;color:var(--muted);font-size:11px;line-height:1.45}.status.ok{color:var(--green)}.status.err{color:#b45309}
    h2{margin:0 0 13px;font-size:17px;letter-spacing:-.035em}.steps{display:grid;gap:10px}.step{display:grid;grid-template-columns:31px 1fr;gap:10px;align-items:start}.num{width:31px;height:31px;border-radius:10px;background:#eff6ff;color:var(--blue);display:grid;place-items:center;font-size:12px;font-weight:1000}.step b{display:block;font-size:13px;margin:2px 0 3px}.step span{color:var(--muted);font-size:11px;line-height:1.5}.changes{margin:0;padding:0;list-style:none;display:grid;gap:8px}.changes li{position:relative;padding-left:17px;color:#475569;font-size:12px;line-height:1.5}.changes li:before{content:"";position:absolute;left:2px;top:.55em;width:6px;height:6px;border-radius:50%;background:var(--blue)}
    .notice{margin-top:13px;padding:13px 14px;border-radius:15px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;font-size:11px;line-height:1.6}.footer{text-align:center;padding:18px 0 2px;color:#94a3b8;font-size:10px}
    @media(max-width:380px){.hero{padding:23px 18px}.hero h1{font-size:27px}.card{padding:15px}}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <div class="brand"><div class="mark">M</div><div><b>마루웰</b><small>MAROOWELL ANDROID</small></div></div>
      <h1>관리자 테스트 앱</h1>
      <p>마루웰 Android 앱의 최신 테스트 버전을 설치하는 공개 페이지입니다. 이 페이지 자체는 로그인 없이 접근할 수 있습니다.</p>
      <div class="badge">● INTERNAL TEST BUILD</div>
    </section>

    <section class="card">
      <div class="row"><span class="label">최신 버전</span><span class="value" id="version">확인 중…</span></div>
      <div class="divider"></div>
      <div class="row"><span class="label">업데이트 일자</span><span class="value" id="updated">확인 중…</span></div>
      <a id="download" class="download disabled" href="#" aria-disabled="true">APK 확인 중…</a>
      <button id="refresh" class="subbtn" type="button">최신 버전 다시 확인</button>
      <div id="status" class="status">다운로드 파일 존재 여부를 확인하고 있습니다.</div>
      <div class="notice">테스트용 앱입니다. Android에서 처음 설치할 때 브라우저의 <b>알 수 없는 앱 설치 허용</b>을 요구할 수 있습니다.</div>
    </section>

    <section class="card">
      <h2>설치 방법</h2>
      <div class="steps">
        <div class="step"><div class="num">1</div><div><b>Android 폰에서 이 페이지 열기</b><span>Chrome 또는 삼성 인터넷으로 maroowell.com/app 에 접속합니다.</span></div></div>
        <div class="step"><div class="num">2</div><div><b>APK 다운로드</b><span>최신 버전 다운로드 버튼을 눌러 파일을 받습니다.</span></div></div>
        <div class="step"><div class="num">3</div><div><b>설치 또는 업데이트</b><span>처음이면 설치, 이미 같은 서명의 앱이 있으면 업데이트로 진행합니다.</span></div></div>
      </div>
    </section>

    <section class="card">
      <h2>이번 테스트 변경사항</h2>
      <ul id="changes" class="changes"><li>버전 정보를 불러오는 중입니다.</li></ul>
    </section>

    <div class="footer">© MAROOWELL · 관리자/내부 테스트 배포</div>
  </main>

  <script>
    const $ = id => document.getElementById(id);
    async function loadVersion(){
      const button=$('download'), status=$('status');
      button.classList.add('disabled'); button.removeAttribute('download'); button.href='#'; button.textContent='APK 확인 중…';
      status.className='status'; status.textContent='다운로드 파일 존재 여부를 확인하고 있습니다.';
      try{
        const metaRes=await fetch('/app_version.json?t='+Date.now(),{cache:'no-store'});
        if(!metaRes.ok) throw new Error('버전 정보 없음');
        const meta=await metaRes.json();
        $('version').textContent=meta.versionName || '-';
        $('updated').textContent=meta.updatedAt || '-';
        const changes=Array.isArray(meta.changes)?meta.changes:[];
        $('changes').innerHTML=changes.length?changes.map(v=>'<li>'+escapeHtml(v)+'</li>').join(''):'<li>등록된 변경사항이 없습니다.</li>';
        if(!meta.downloadUrl) throw new Error('APK 경로 미설정');
        let exists=false;
        try{ const head=await fetch(meta.downloadUrl+'?t='+Date.now(),{method:'HEAD',cache:'no-store'}); exists=head.ok; }catch(e){}
        if(exists){
          button.classList.remove('disabled'); button.href=meta.downloadUrl; button.setAttribute('download','maroowell.apk'); button.textContent='최신 APK 다운로드';
          status.className='status ok'; status.textContent='다운로드 가능 · 로그인 없이 설치 파일을 받을 수 있습니다.';
        }else{
          button.textContent='APK 게시 준비 중'; status.className='status err'; status.textContent='페이지는 공개 완료됐지만 아직 APK 파일이 게시되지 않았습니다.';
        }
      }catch(err){
        $('version').textContent='-'; $('updated').textContent='-'; $('changes').innerHTML='<li>버전 정보를 불러오지 못했습니다.</li>';
        button.textContent='다운로드 준비 중'; status.className='status err'; status.textContent='버전 정보를 확인하지 못했습니다.';
      }
    }
    function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
    $('refresh').addEventListener('click',loadVersion);
    loadVersion();
  </script>
</body>
</html>
