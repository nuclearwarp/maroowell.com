#!/usr/bin/env node
/*
  public/maroowell_schedule 모바일 표시 개선 자동 패치 스크립트

  실행 위치: repository root
  실행 명령:
    node apply_maroowell_schedule_mobile_fix.js

  생성 파일:
    public/maroowell_schedule.mobile_fixed_full.txt

  실제 반영:
    cp public/maroowell_schedule.mobile_fixed_full.txt public/maroowell_schedule

  적용 내용:
    1) 상단 메뉴 숨김/열기 버튼이 없으면 추가
    2) toolbar id가 없으면 추가
    3) 메뉴 숨김 상태 저장/복원 JS가 없으면 추가
    4) 모바일에서 Week/Camp 컬럼을 숨기고 Route+날짜 표가 바로 보이도록 CSS 최종 오버라이드
    5) 기존 스케줄 기능/저장/불러오기/엑셀/이미지복사 로직은 변경하지 않음
*/

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "maroowell_schedule");
const OUT = path.join(ROOT, "public", "maroowell_schedule.mobile_fixed_full.txt");

if (!fs.existsSync(SRC)) {
  console.error("[ERROR] public/maroowell_schedule 파일을 찾지 못했습니다.");
  console.error("현재 위치:", ROOT);
  process.exit(1);
}

let code = fs.readFileSync(SRC, "utf8");

function replaceOnce(pattern, replacement, label) {
  if (!pattern.test(code)) {
    console.warn(`[WARN] ${label} 패턴을 찾지 못했습니다. 건너뜁니다.`);
    return false;
  }
  code = code.replace(pattern, replacement);
  console.log(`[OK] ${label}`);
  return true;
}

/* 1) toolbar id 보정 */
if (!/<section[^>]+id=["']toolbar["'][^>]*class=["']toolbar["'][^>]*>/i.test(code)) {
  replaceOnce(
    /<section\s+class=["']toolbar["']\s*>/i,
    `<section id="toolbar" class="toolbar">`,
    "toolbar id 추가"
  );
} else {
  console.log("[SKIP] toolbar id 이미 있음");
}

/* 2) 상단 메뉴 숨김 버튼 보정 */
if (!/id=["']btnToggleToolbar["']/.test(code)) {
  replaceOnce(
    /(\s*<button\s+id=["']btnLogout["'][\s\S]*?<\/button>)/i,
    `      <button id="btnToggleToolbar" class="btn copy toolbarToggle" type="button">메뉴 숨김</button>\n$1`,
    "btnToggleToolbar 버튼 추가"
  );
} else {
  console.log("[SKIP] btnToggleToolbar 버튼 이미 있음");
}

/* 3) els 객체 보정 */
if (!/btnToggleToolbar\s*:\s*document\.getElementById\(["']btnToggleToolbar["']\)/.test(code)) {
  const elsInsert = `btnLogout:document.getElementById("btnLogout"),
        btnToggleToolbar:document.getElementById("btnToggleToolbar"),
        toolbar:document.getElementById("toolbar"),`;

  const done = replaceOnce(
    /btnLogout\s*:\s*document\.getElementById\(["']btnLogout["']\)\s*,?/,
    elsInsert,
    "els.btnToggleToolbar / els.toolbar 추가"
  );

  if (!done) {
    console.warn("[WARN] els 객체에 btnToggleToolbar를 자동 삽입하지 못했습니다. 수동 확인 필요.");
  }
} else {
  console.log("[SKIP] els.btnToggleToolbar 이미 있음");
}

/* 4) toolbar 숨김 JS 함수 보정 */
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

if (!/function\s+setToolbarHidden\s*\(/.test(code)) {
  if (/function\s+bind\s*\(\)\s*\{/.test(code)) {
    code = code.replace(/(\n\s*)function\s+bind\s*\(\)\s*\{/, `$1${toolbarFunctions}$1function bind(){`);
    console.log("[OK] setToolbarHidden / restoreToolbarState 함수 추가");
  } else {
    console.warn("[WARN] function bind() 위치를 찾지 못해서 toolbar 숨김 함수를 삽입하지 못했습니다.");
  }
} else {
  console.log("[SKIP] setToolbarHidden 함수 이미 있음");
}

/* 5) bind 이벤트 보정 */
if (!/btnToggleToolbar[\s\S]*addEventListener\(["']click["']/.test(code)) {
  const bindEvent = `
        if(els.btnToggleToolbar){
          els.btnToggleToolbar.addEventListener("click", () => {
            const hidden = !els.toolbar.classList.contains("toolbarHidden");
            setToolbarHidden(hidden);
          });
        }

`;
  if (/function\s+bind\s*\(\)\s*\{/.test(code)) {
    code = code.replace(/function\s+bind\s*\(\)\s*\{/, `function bind(){${bindEvent}`);
    console.log("[OK] btnToggleToolbar click 이벤트 추가");
  } else {
    console.warn("[WARN] bind 함수 위치를 찾지 못해서 click 이벤트를 삽입하지 못했습니다.");
  }
} else {
  console.log("[SKIP] btnToggleToolbar click 이벤트 이미 있음");
}

/* 6) boot restore 호출 보정 */
if (!/restoreToolbarState\s*\(\s*\)\s*;/.test(code)) {
  if (/async\s+function\s+boot\s*\(\)\s*\{\s*bind\s*\(\s*\)\s*;/.test(code)) {
    code = code.replace(
      /(async\s+function\s+boot\s*\(\)\s*\{\s*bind\s*\(\s*\)\s*;)/,
      `$1\n        restoreToolbarState();`
    );
    console.log("[OK] boot() restoreToolbarState 호출 추가");
  } else {
    console.warn("[WARN] boot() 안의 bind(); 위치를 찾지 못해서 restoreToolbarState 호출을 삽입하지 못했습니다.");
  }
} else {
  console.log("[SKIP] restoreToolbarState 호출 이미 있음");
}

/* 7) 기존 최종 모바일 패치 블록 제거 후 새 블록 삽입 */
code = code.replace(
  /\n\s*\/\*\s*===== MAROOWELL SCHEDULE FINAL MOBILE FIX START =====\s*\*\/[\s\S]*?\/\*\s*===== MAROOWELL SCHEDULE FINAL MOBILE FIX END =====\s*\*\/\s*/g,
  "\n"
);

const finalMobileCss = `
    /* ===== MAROOWELL SCHEDULE FINAL MOBILE FIX START ===== */
    /*
      모바일 핵심 수정:
      - toolbar는 숨김/열기 가능
      - 모바일에서 Week/Camp rowspan 컬럼을 숨김
      - Route 컬럼을 왼쪽 sticky 처리
      - 첫 화면에서 Route + 날짜가 바로 보이게 조정
      - 기존 저장/조회/엑셀/이미지복사 기능은 CSS/버튼 보정 외 건드리지 않음
    */
    .toolbar.toolbarHidden{
      display:none!important;
    }

    .toolbarToggle{
      background:rgba(14,116,144,.55)!important;
      border-color:rgba(103,232,249,.35)!important;
    }

    @media(max-width:720px){
      html,body{
        overflow:auto!important;
        background:#081120!important;
      }

      .app{
        min-height:100dvh!important;
        height:auto!important;
        display:block!important;
      }

      .topbar{
        position:sticky!important;
        top:0!important;
        z-index:100!important;
        padding:9px 10px!important;
        gap:8px!important;
      }

      .brand{
        flex:1 1 auto!important;
        min-width:0!important;
        overflow:hidden!important;
      }

      .brandText{
        min-width:0!important;
        overflow:hidden!important;
      }

      .brandText h1{
        max-width:150px!important;
        font-size:18px!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
      }

      .brandText p{
        display:none!important;
      }

      .logoButton{
        width:34px!important;
        height:34px!important;
        border-radius:12px!important;
      }

      .logoButton img{
        width:26px!important;
        height:26px!important;
      }

      .userBadge{
        display:none!important;
      }

      .topbar .btn{
        height:36px!important;
        padding:0 12px!important;
        font-size:13px!important;
        flex:0 0 auto!important;
      }

      .toolbar{
        position:sticky!important;
        top:53px!important;
        z-index:90!important;
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:8px!important;
        padding:10px!important;
        max-height:calc(100dvh - 56px)!important;
        overflow:auto!important;
        border-bottom:1px solid rgba(255,255,255,.16)!important;
        box-shadow:0 12px 28px rgba(0,0,0,.35)!important;
      }

      .toolbar.toolbarHidden{
        display:none!important;
      }

      .toolbar > .field,
      .toolbar > .updateEditor,
      .toolbar > .weekBtns,
      .toolbar > .btn{
        width:100%!important;
        min-width:0!important;
      }

      .toolbar .btn{
        width:100%!important;
      }

      .weekBtns{
        display:grid!important;
        grid-template-columns:1fr 1fr!important;
        gap:8px!important;
      }

      .updateEditor{
        grid-template-columns:1fr!important;
        height:auto!important;
        gap:8px!important;
      }

      .dateMini{
        grid-template-columns:42px 1fr!important;
      }

      .btnMini{
        width:100%!important;
        height:35px!important;
      }

      .metaLine{
        grid-column:1 / -1!important;
        gap:6px!important;
        font-size:11px!important;
      }

      .pill{
        padding:4px 8px!important;
        font-size:11px!important;
      }

      .main{
        display:block!important;
        height:auto!important;
        min-height:0!important;
        overflow:visible!important;
      }

      .boardWrap{
        height:auto!important;
        min-height:calc(100dvh - 64px)!important;
        padding:8px!important;
        overflow:auto!important;
        -webkit-overflow-scrolling:touch!important;
        overscroll-behavior:contain!important;
      }

      .scheduleBoard{
        min-width:760px!important;
        width:max-content!important;
        max-width:none!important;
        border-radius:14px!important;
        overflow:hidden!important;
        touch-action:pan-x pan-y!important;
      }

      .boardHeader{
        padding:14px 14px!important;
        display:flex!important;
        flex-direction:column!important;
        align-items:flex-start!important;
        gap:10px!important;
      }

      .boardTitle h2{
        font-size:22px!important;
        line-height:1.15!important;
        max-width:calc(100vw - 46px)!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
      }

      .boardTitle p{
        font-size:13px!important;
        line-height:1.35!important;
        max-width:calc(100vw - 46px)!important;
        white-space:normal!important;
      }

      .boardActions{
        width:100%!important;
        display:flex!important;
        gap:8px!important;
        overflow-x:auto!important;
        padding-bottom:2px!important;
      }

      .boardActions .btn{
        flex:0 0 auto!important;
        height:38px!important;
        padding:0 13px!important;
        font-size:13px!important;
      }

      /*
        Week/Camp는 상단 제목에 이미 있으므로 모바일에서는 숨김.
        노란 Week rowspan이 화면을 먹는 문제를 차단.
      */
      .scheduleTable col:nth-child(1),
      .scheduleTable col:nth-child(2){
        visibility:collapse!important;
        width:0!important;
        min-width:0!important;
        max-width:0!important;
      }

      .scheduleTable thead th:nth-child(1),
      .scheduleTable thead th:nth-child(2),
      .scheduleTable td.weekCell,
      .scheduleTable td.campCell{
        display:none!important;
        width:0!important;
        min-width:0!important;
        max-width:0!important;
        padding:0!important;
        border:0!important;
        overflow:hidden!important;
      }

      .scheduleTable{
        table-layout:fixed!important;
        width:auto!important;
        min-width:760px!important;
        user-select:none!important;
      }

      .scheduleTable th{
        height:52px!important;
        min-height:52px!important;
        padding:5px 4px!important;
        font-size:12px!important;
      }

      .routeHead,
      .routeCell{
        width:118px!important;
        min-width:118px!important;
        max-width:118px!important;
      }

      .scheduleTable .routeHead{
        position:sticky!important;
        left:0!important;
        z-index:18!important;
      }

      .scheduleTable .routeCell{
        position:sticky!important;
        left:0!important;
        z-index:12!important;
      }

      .routeInner{
        min-height:40px!important;
        padding:5px 7px!important;
      }

      .routeLabel{
        font-size:13px!important;
      }

      .expander{
        width:24px!important;
        height:24px!important;
        font-size:12px!important;
      }

      .childRoute .routeLabel{
        padding-left:10px!important;
        font-size:12px!important;
      }

      .childBadge{
        height:18px!important;
        padding:0 6px!important;
        font-size:10px!important;
      }

      .cellEdit{
        height:40px!important;
        min-height:40px!important;
        padding:4px 5px!important;
        font-size:12px!important;
        user-select:text!important;
      }

      .dayHeader{
        gap:4px!important;
      }

      .dayActions{
        gap:3px!important;
      }

      .dayBtn{
        height:20px!important;
        padding:0 5px!important;
        font-size:10px!important;
      }

      .suggestBox{
        width:calc(100vw - 20px)!important;
        max-height:45dvh!important;
        left:10px!important;
        right:10px!important;
      }

      .weekPopup{
        position:fixed!important;
        left:10px!important;
        right:10px!important;
        top:62px!important;
        width:auto!important;
        max-width:none!important;
        max-height:calc(100dvh - 80px)!important;
        overflow:auto!important;
      }
    }
    /* ===== MAROOWELL SCHEDULE FINAL MOBILE FIX END ===== */
`;

if (!/<\/style>/i.test(code)) {
  console.error("[ERROR] </style> 태그를 찾지 못했습니다. CSS를 삽입할 수 없습니다.");
  process.exit(1);
}

code = code.replace(/<\/style>/i, `${finalMobileCss}\n  </style>`);
console.log("[OK] 최종 모바일 CSS 삽입");

fs.writeFileSync(OUT, code, "utf8");

console.log("");
console.log("[DONE] 전체 교체본 txt 생성 완료");
console.log("생성 파일:", path.relative(ROOT, OUT));
console.log("");
console.log("실제 반영 명령:");
console.log("  cp public/maroowell_schedule.mobile_fixed_full.txt public/maroowell_schedule");
console.log("  git diff -- public/maroowell_schedule");
console.log("  git add public/maroowell_schedule");
console.log('  git commit -m "Fix maroowell schedule mobile table layout"');
console.log("  git push");
