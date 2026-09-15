from pathlib import Path
import re

p = Path('public/maroowell_schedule')
s = p.read_text(encoding='utf-8')

# Compact modal class.
s = s.replace(
    '<div class="excelDateDialog" role="dialog" aria-modal="true" aria-labelledby="metaUploadDateTitle">',
    '<div class="excelDatePanel metaUploadPanel" role="dialog" aria-modal="true" aria-labelledby="metaUploadDateTitle">',
    1,
)
s = s.replace(
    '<div class="excelDatePanel" role="dialog" aria-modal="true" aria-labelledby="metaUploadDateTitle">',
    '<div class="excelDatePanel metaUploadPanel" role="dialog" aria-modal="true" aria-labelledby="metaUploadDateTitle">',
    1,
)

# Description.
desc_pattern = r'        els\.metaUploadDateDesc\.textContent=`[^`]*`;'
desc = '''        els.metaUploadDateDesc.textContent=`${state.camp || "-"} / ${waveLabel(state.wave)} / ${weekRangeLabel()} · 전송할 일자를 선택하세요. 전송 시 메타어드민의 해당 업무일 기존 등록자를 먼저 조회하여, 실제 등록되어 있는 인원만 휴무 처리한 뒤 현재 마루웰 스케줄을 업로드합니다.`;'''
s, n = re.subn(desc_pattern, desc, s, count=1)
if n != 1:
    raise SystemExit(f'description replacement count={n}')

helper = r'''      function metaResetRowsFromCurrent(current,metaDate){
        // MetaAdmin 조회 결과의 실제 등록자만 휴무 처리한다.
        const source=Array.isArray(current?.registered_people)?current.registered_people:[];
        const out=[];
        const seen=new Set();
        for(const person of source){
          const name=clean(person?.name || person?.driver_name || person?.display_name);
          const id=clean(person?.id || person?.coupang_id || person?.login_id);
          if(!name||!id)continue;
          const key=keyOf(id)||keyOf(name);
          if(!key||seen.has(key))continue;
          seen.add(key);
          out.push({date:metaDate,name,id,routes:[]});
        }
        return out.sort((a,b)=>{
          const nc=sortText(a.name,b.name);
          return nc!==0?nc:sortText(a.id,b.id);
        });
      }'''
helper_pattern = r'      function metaResetRowsFromCurrent\(current,metaDate\)\{.*?\n      \}'
if re.search(helper_pattern, s, flags=re.S):
    s = re.sub(helper_pattern, helper, s, count=1, flags=re.S)
else:
    anchor = '''      function metaUploadDateForScheduleDate(scheduleDate){
        const date=normalizeDateInput(scheduleDate);
        return normalizeWave(state.wave)==="WAVE1"?addDays(date,1):date;
      }'''
    if anchor not in s:
        raise SystemExit('metaUploadDateForScheduleDate anchor missing')
    s = s.replace(anchor, anchor + '\n\n' + helper, 1)

upload_fn = r'''      async function uploadMetaScheduleForDate(scheduleDate){
        const selectedDate=normalizeDateInput(scheduleDate);
        if(!selectedDate||!state.camp||!state.weekDates.includes(selectedDate)){
          alert("전송할 일자를 다시 선택해주세요.");
          return;
        }
        if(!window.XLSX){
          alert("엑셀 생성 라이브러리를 불러오지 못했습니다.");
          return;
        }
        if(state.metaUploadBusy)return;

        state.metaUploadBusy=true;
        if(els.btnMetaUpload)els.btnMetaUpload.disabled=true;
        if(els.btnMetaUploadDateRun)els.btnMetaUploadDateRun.disabled=true;
        closeMetaUploadDatePicker();

        let resetCompleted=false;
        try{
          setStatus(`${dateLabel(selectedDate)} 메타어드민 전송 준비 중...`);
          try{
            const added=await loadAllMaroowellInfoRowsForAccountLookup();
            if(added>0)buildDriverAccounts();
          }catch(e){
            console.warn("[meta upload] global account refresh failed",e);
          }
          await ensureGlobalInfoAccountsForNames(metaDisplayNamesOnBoard());

          const actualRows=collectMetaRows({scheduleDate:selectedDate});
          if(!actualRows.length)throw new Error(`${dateLabel(selectedDate)}에 전송할 출근 스케줄이 없습니다.`);

          const metaDate=metaUploadDateForScheduleDate(selectedDate);
          const current=await apiFetch("/schedule/meta/current?"+new URLSearchParams({
            camp:state.camp,
            wave:state.wave,
            date:metaDate
          }).toString());

          const resetRows=metaResetRowsFromCurrent(current,metaDate);
          const resetNeeded=current?.has_existing===true && resetRows.length>0;

          if(current?.has_existing===true && !resetRows.length){
            throw new Error("메타어드민에 기존 스케줄이 존재하지만 실제 등록자의 이름/아이디를 읽지 못했습니다. 안전을 위해 전송을 중단했습니다.");
          }

          const ok=confirm(
            `${state.camp} / ${waveLabel(state.wave)} / ${dateLabel(selectedDate)}\n\n`+
            (resetNeeded
              ? `메타어드민 기존 등록 ${resetRows.length}명만 먼저 휴무 처리한 뒤, 현재 스케줄 ${actualRows.length}명을 업로드합니다.\n\n기존 등록: ${resetRows.map(r=>r.name).join(", ")}\n`
              : `메타어드민 기존 등록자가 없어 현재 스케줄 ${actualRows.length}명을 바로 업로드합니다.\n`)+
            `\n계속할까요?`
          );
          if(!ok){setStatus("메타어드민 전송 취소");return;}

          if(resetNeeded){
            setStatus(`기존 메타 등록 ${resetRows.length}명 휴무 처리 중...`);
            const resetWb=buildMetaUploadWorkbook(resetRows,"휴무");
            const resetUpload=await uploadMetaWorkbook({
              wb:resetWb,
              fileName:`${metaCampName(state.camp)}_${waveLabel(state.wave)}_${metaDate}_reset_off.xlsx`,
              camp:state.camp,wave:state.wave,metaDate,phase:"reset"
            });
            const resetResult=await pollMetaWorkflow(resetUpload.workflow_id);
            if(clean(resetResult?.status).toUpperCase()!=="SUCCESS"){
              throw new Error("기존 메타 등록자 휴무 처리 실패\n"+metaWorkflowFailureText(resetResult,resetRows));
            }
            resetCompleted=true;
          }

          setStatus(`현재 마루웰 스케줄 ${actualRows.length}명 업로드 중...`);
          const actualWb=buildMetaUploadWorkbook(actualRows,META_WORK_STATUS);
          const actualUpload=await uploadMetaWorkbook({
            wb:actualWb,
            fileName:`${metaCampName(state.camp)}_${waveLabel(state.wave)}_${metaDate}_schedule.xlsx`,
            camp:state.camp,wave:state.wave,metaDate,phase:"apply"
          });
          const actualResult=await pollMetaWorkflow(actualUpload.workflow_id);
          if(clean(actualResult?.status).toUpperCase()!=="SUCCESS"){
            const prefix=resetCompleted?"※ 기존 MetaAdmin 등록자 휴무 처리는 완료된 상태입니다. 새 스케줄 업로드 오류를 즉시 확인해주세요.\n\n":"";
            throw new Error(prefix+metaWorkflowFailureText(actualResult,actualRows));
          }

          const summary=metaWorkflowSummary(actualResult);
          setStatus(`메타어드민 전송 완료: 기존 ${resetRows.length}명 정리 / 신규 ${actualRows.length}명 / ${summary}`);
          alert(`메타어드민 전송이 완료되었습니다.\n\n${state.camp} / ${waveLabel(state.wave)} / ${dateLabel(selectedDate)}\n기존 등록 휴무 처리: ${resetRows.length}명\n신규 스케줄: ${actualRows.length}명\n\n${summary}`);
        }catch(e){
          console.error("[meta upload]",e);
          setStatus(`메타어드민 전송 실패: ${e?.message||e}`);
          alert(`메타어드민 전송 실패\n\n${e?.message||e}`);
        }finally{
          state.metaUploadBusy=false;
          if(els.btnMetaUpload)els.btnMetaUpload.disabled=false;
          if(els.btnMetaUploadDateRun)els.btnMetaUploadDateRun.disabled=false;
        }
      }

      async function copyImage(){'''
pattern = r'      async function uploadMetaScheduleForDate\(scheduleDate\)\{.*?\n      \}\n\n      async function copyImage\(\)\{'
s, n = re.subn(pattern, upload_fn, s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'upload function replacement count={n}')

css = r'''
    /* ===== META UPLOAD MODAL COMPACT FINAL ===== */
    #metaUploadDateModal{padding:20px!important;align-items:center!important;justify-content:center!important;}
    #metaUploadDateModal .metaUploadPanel{width:min(760px,calc(100vw - 40px))!important;max-width:760px!important;max-height:min(82vh,720px)!important;border-radius:18px!important;overflow:hidden!important;}
    #metaUploadDateModal .excelDateHead{padding:14px 16px!important;}
    #metaUploadDateModal .excelDateHead h3{font-size:18px!important;}
    #metaUploadDateModal .excelDateBody{padding:14px 16px 16px!important;overflow:auto!important;max-height:calc(82vh - 64px)!important;}
    #metaUploadDateModal .excelDateDesc{margin:0 0 12px!important;font-size:12px!important;line-height:1.55!important;color:#64748b!important;}
    #metaUploadDateModal .excelDateList{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;}
    #metaUploadDateModal .excelDateOption{min-height:58px!important;padding:9px 12px!important;border-radius:12px!important;font-size:14px!important;}
    #metaUploadDateModal .excelDateOption small{margin-top:5px!important;font-size:11px!important;}
    #metaUploadDateModal .excelDateOption.selected{box-shadow:inset 0 0 0 2px #2563eb!important;}
    @media(max-width:620px){
      #metaUploadDateModal{padding:10px!important;}
      #metaUploadDateModal .metaUploadPanel{width:calc(100vw - 20px)!important;max-height:90vh!important;}
      #metaUploadDateModal .excelDateList{grid-template-columns:1fr!important;}
      #metaUploadDateModal .excelDateBody{max-height:calc(90vh - 60px)!important;}
    }
    /* ===== META UPLOAD MODAL COMPACT FINAL END ===== */
'''
if 'META UPLOAD MODAL COMPACT FINAL' not in s:
    idx = s.rfind('</style>')
    if idx < 0:
        raise SystemExit('style close missing')
    s = s[:idx] + css + s[idx:]

p.write_text(s, encoding='utf-8')

w = Path('workers/schedule-api/worker.js')
t = w.read_text(encoding='utf-8')
t = re.sub(r'\n\s*// Safety guard:[^\n]*\n(?:\s*//[^\n]*\n)?\s*if \(phase\.toLowerCase\(\) === "reset"\) throw httpError\(409, "meta_reset_disabled_direct_schedule_upload_only"\);', '', t, count=1)
w.write_text(t, encoding='utf-8')

if 'meta_reset_disabled_direct_schedule_upload_only' in t:
    raise SystemExit('stale reset guard remains')
if 'buildMetaUploadWorkbook(resetRows,"휴무")' not in s:
    raise SystemExit('reset workbook flow missing')
if 'phase:"reset"' not in s:
    raise SystemExit('reset phase missing')
