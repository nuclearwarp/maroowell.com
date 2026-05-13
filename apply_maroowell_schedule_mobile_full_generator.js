/*
  maroowell_schedule 모바일 메뉴 숨김/열기 패치

  사용 방법:
  1) 이 파일 내용을 apply_maroowell_schedule_mobile_patch.js 로 저장
  2) 프로젝트 루트에서 실행:
     node apply_maroowell_schedule_mobile_patch.js public/maroowell_schedule

  적용 내용:
  - topbar에 메뉴 숨김/열기 버튼 추가
  - toolbar에 id="toolbar" 추가
  - 모바일 보기용 CSS 보강
  - toolbar 숨김 상태 localStorage 저장/복원
  - 기존 기능은 수정하지 않고 해당 기능만 삽입
*/

const fs = require('fs');
const path = process.argv[2] || 'public/maroowell_schedule';

if (!fs.existsSync(path)) {
  console.error(`[ERROR] 파일을 찾을 수 없습니다: ${path}`);
  process.exit(1);
}

let html = fs.readFileSync(path, 'utf8');
const original = html;

function onceReplace(target, search, replace, label) {
  if (target.includes(replace)) return target;
  if (!target.includes(search)) {
    throw new Error(`[${label}] 교체 기준 문자열을 찾지 못했습니다.`);
  }
  return target.replace(search, replace);
}

// 1) topbar 버튼 추가
html = onceReplace(
  html,
  `      <div id="userBadge" class="userBadge">-</div>\n      <button id="btnLogout" class="btn danger" type="button">로그아웃</button>`,
  `      <div id="userBadge" class="userBadge">-</div>\n      <button id="btnToggleToolbar" class="btn copy toolbarToggle" type="button">메뉴 숨김</button>\n      <button id="btnLogout" class="btn danger" type="button">로그아웃</button>`,
  'topbar toggle button'
);

// 2) toolbar id 추가
html = onceReplace(
  html,
  `<section class="toolbar">`,
  `<section id="toolbar" class="toolbar">`,
  'toolbar id'
);

// 3) CSS 추가. 기존 CSS 하단에만 추가해서 기존 기능 영향 최소화.
const mobileCss = `

    /* ===== mobile toolbar toggle / mobile optimization ===== */
    .toolbar.toolbarHidden{display:none!important}
    .toolbarToggle{background:rgba(14,116,144,.55);border-color:rgba(103,232,249,.35)}
    .boardWrap{-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
    .scheduleBoard{touch-action:pan-x pan-y}
    .scheduleTable{user-select:none}
    .cellEdit{user-select:text}

    @media(max-width:1080px){
      body{overflow:auto!important}
      .app{min-height:100dvh!important;height:auto!important;display:block!important}
      .topbar{position:sticky!important;top:0!important;z-index:50!important;padding:9px 10px!important}
      .brand{flex:1;min-width:0}
      .brandText h1{font-size:18px!important}
      .brandText p{display:none!important}
      .userBadge{display:none!important}
      .topbar .btn{height:34px;padding:0 10px;font-size:12px}
      .toolbar{position:sticky!important;top:53px!important;z-index:45!important;grid-template-columns:1fr 1fr!important;gap:8px!important;padding:10px!important;max-height:calc(100dvh - 54px);overflow:auto;border-bottom:1px solid rgba(255,255,255,.14);box-shadow:0 12px 28px rgba(0,0,0,.28)}
      .toolbar.toolbarHidden{display:none!important}
      .toolbar>.field,.toolbar>.updateEditor,.toolbar>.weekBtns,.toolbar>.btn{min-width:0}
      .toolbar>.btn{width:100%}
      .weekBtns{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px;width:100%}
      .weekBtns .btn{width:100%}
      .updateEditor{grid-column:1 / -1;height:auto;grid-template-columns:1fr 1fr 58px}
      .metaLine{grid-column:1 / -1;font-size:11px;gap:6px}
      .pill{padding:4px 8px;font-size:11px}
      .main{display:block!important;overflow:visible!important;min-height:0}
      .boardWrap{height:auto!important;min-height:calc(100dvh - 64px);overflow:auto!important;padding:10px!important}
      .scheduleBoard{min-width:920px!important;width:max-content;max-width:none;border-radius:14px}
      .boardHeader{padding:12px!important}
      .boardTitle h2{font-size:19px!important}
      .boardTitle p{font-size:12px!important}
      .boardActions{gap:6px}
      .boardActions .btn{height:34px;padding:0 10px;font-size:12px}
      .scheduleTable th{min-height:48px;padding:6px 4px;font-size:12px}
      .weekCell{width:104px!important;font-size:14px!important}
      .campCell{width:96px!important;font-size:15px!important}
      .routeHead,.routeCell{width:136px!important}
      .routeInner{min-height:38px;padding:5px 7px}
      .routeLabel{font-size:13px}
      .cellEdit{height:38px;min-height:38px;font-size:12px;padding:4px 5px}
      .dayActions{gap:3px}
      .dayBtn{height:20px;padding:0 5px;font-size:10px}
      .suggestBox{width:min(340px, calc(100vw - 20px));max-height:45dvh}
    }

    @media(max-width:560px){
      .topbar{gap:7px!important}
      .logoButton{width:31px!important;height:31px!important;border-radius:10px!important}
      .logoButton img{width:24px!important;height:24px!important}
      .brandText h1{font-size:17px!important;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .topbar .btn{height:32px;padding:0 8px;font-size:11px}
      .toolbar{top:50px!important;grid-template-columns:1fr!important;padding:9px!important}
      .field label{font-size:11px}
      .input,.select,.weekButton{height:39px;font-size:13px;border-radius:11px}
      .updateEditor{grid-template-columns:1fr!important;gap:7px}
      .dateMini{grid-template-columns:42px 1fr}
      .btnMini{width:100%;height:34px}
      .weekPopup{position:fixed!important;left:10px!important;right:10px!important;top:62px!important;width:auto!important;max-width:none!important;max-height:calc(100dvh - 80px);overflow:auto}
      .boardWrap{padding:8px!important}
      .scheduleBoard{min-width:860px!important;border-radius:12px}
      .boardHeader{align-items:flex-start!important;flex-direction:column!important;gap:9px}
      .boardActions{width:100%;display:grid!important;grid-template-columns:1fr}
      .boardActions .btn{width:100%}
      .emptyBoard{padding:32px 12px;font-size:13px}
    }
`;

if (!html.includes('mobile toolbar toggle / mobile optimization')) {
  html = html.replace(/\n\s*<\/style>/, mobileCss + '\n  </style>');
}

// 4) els에 toolbar 요소 추가
html = onceReplace(
  html,
  `        userBadge:document.getElementById("userBadge"),\n        btnLogout:document.getElementById("btnLogout"),`,
  `        userBadge:document.getElementById("userBadge"),\n        btnLogout:document.getElementById("btnLogout"),\n        btnToggleToolbar:document.getElementById("btnToggleToolbar"),\n        toolbar:document.getElementById("toolbar"),`,
  'els toolbar refs'
);

// 5) toolbar 숨김/복원 함수 추가
const toolbarFunctions = `
      function setToolbarHidden(hidden){
        if(!els.toolbar || !els.btnToggleToolbar) return;

        els.toolbar.classList.toggle("toolbarHidden", !!hidden);
        els.btnToggleToolbar.textContent = hidden ? "메뉴 열기" : "메뉴 숨김";

        try{
          localStorage.setItem("mw_schedule_toolbar_hidden", hidden ? "1" : "0");
        }catch{}
      }

      function restoreToolbarState(){
        let hidden = false;

        try{
          hidden = localStorage.getItem("mw_schedule_toolbar_hidden") === "1";
        }catch{}

        setToolbarHidden(hidden);
      }

`;

if (!html.includes('function setToolbarHidden(hidden)')) {
  if (html.includes('\n      function bind(){')) {
    html = html.replace('\n      function bind(){', '\n' + toolbarFunctions + '      function bind(){');
  } else {
    throw new Error('[toolbar functions] function bind(){ 위치를 찾지 못했습니다.');
  }
}

// 6) bind() 내부 이벤트 추가
const bindEvent = `
        if(els.btnToggleToolbar){
          els.btnToggleToolbar.addEventListener("click",()=>{
            const hidden = !els.toolbar.classList.contains("toolbarHidden");
            setToolbarHidden(hidden);
          });
        }

`;

if (!html.includes('els.btnToggleToolbar.addEventListener("click"')) {
  html = html.replace('      function bind(){\n', '      function bind(){\n' + bindEvent);
}

// 7) boot()에서 숨김 상태 복원
if (!html.includes('restoreToolbarState();')) {
  html = html.replace('        bind();\n', '        bind();\n        restoreToolbarState();\n');
}

if (html === original) {
  console.log('[OK] 이미 패치가 적용되어 있습니다. 변경 없음.');
  process.exit(0);
}

const backupPath = `${path}.backup_before_mobile_toolbar_${Date.now()}`;
fs.writeFileSync(backupPath, original, 'utf8');
fs.writeFileSync(path, html, 'utf8');

console.log('[OK] 패치 적용 완료');
console.log(`[OK] 백업: ${backupPath}`);
console.log(`[OK] 수정 파일: ${path}`);
