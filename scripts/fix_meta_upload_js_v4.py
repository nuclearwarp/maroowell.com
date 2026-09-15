from pathlib import Path
import re

p=Path('public/maroowell_schedule')
s=p.read_text(encoding='utf-8')

upload_fn=r'''      async function uploadMetaScheduleForDate(scheduleDate){
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

pattern=r'      async function uploadMetaScheduleForDate\(scheduleDate\)\{.*?\n      \}\n\n      async function copyImage\(\)\{'
s,n=re.subn(pattern,lambda m:upload_fn,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit(f'upload function replacement count={n}')

p.write_text(s,encoding='utf-8')

# Basic inline-script syntax check input.
matches=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',s,flags=re.S|re.I)
if not matches:
    raise SystemExit('inline script missing')
Path('/tmp/mw_schedule_inline.js').write_text(matches[-1],encoding='utf-8')
