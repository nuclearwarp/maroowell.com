from pathlib import Path

path = Path('public/coupang_camp')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    text = text.replace(old, new, 1)


# 1) QR modal: slightly larger preview/canvas.
replace_once(
    '.modalCard{width:min(440px,100%);',
    '.modalCard{width:min(500px,100%);',
    'QR modal width'
)
replace_once(
    '<div class="modalBody"><div class="qrBox"><canvas id="qrCanvas" width="220" height="220"></canvas></div><div id="qrMeta" class="qrMeta"></div></div>',
    '<div class="modalBody"><div class="qrBox"><canvas id="qrCanvas" width="300" height="300"></canvas></div><div id="qrMeta" class="qrMeta"></div></div>',
    'QR canvas size'
)

# 2) Reuse the existing parent relation for mobile/mini QR and region inheritance.
parent_anchor = '      function currentParent(row, index=byId(), bases=baseByCamp()) { return resolveParent(row,index,bases).row; }\n'
parent_insert = '''      function currentParent(row, index=byId(), bases=baseByCamp()) { return resolveParent(row,index,bases).row; }

      function inheritedParent(row, index=byId(), bases=baseByCamp()) {
        if (!row || isSubHub(row) || isBaseCampRow(row)) return null;
        return resolveParent(row,index,bases).row || null;
      }

      function effectiveRegion(row, index=byId(), bases=baseByCamp()) {
        const parent = inheritedParent(row,index,bases);
        return text(parent?.region) || text(row?.region);
      }

      function qrSource(row, index=byId(), bases=baseByCamp()) {
        const parent = inheritedParent(row,index,bases);
        return {
          row: parent || row,
          inherited: !!parent
        };
      }
'''
replace_once(parent_anchor, parent_insert, 'parent inheritance helpers')

# 3) Region cell: child mobile/mini camps display the parent region and cannot override it while a parent exists.
input_anchor = '''      function inputHtml(row, field, cls="") {
        const disabled = !state.canEdit || row._deleted || isSubHub(row) && (field === "parent_camp_id" || field === "receiving_sh_id");
        const value = row[field] ?? "";
        if (field === "description" || field === "address") return `<textarea class="cellTextarea ${cls}" data-field="${field}" ${disabled?"disabled":""}>${esc(value)}</textarea>`;
        return `<input class="cellInput ${cls}" data-field="${field}" value="${esc(value)}" ${disabled?"disabled":""}>`;
      }
'''
input_replacement = input_anchor + '''
      function regionInputHtml(row) {
        const parent = inheritedParent(row);
        const value = parent ? effectiveRegion(row) : text(row.region);
        const disabled = !state.canEdit || row._deleted || !!parent;
        const title = parent
          ? `본캠프 ${text(parent.camp) || "-"} 지역 상속 · ${value || "미지정"}`
          : "";
        return `<input class="cellInput center" data-field="region" value="${esc(value)}" ${disabled?"disabled":""} ${title?`title="${esc(title)}"`:""}>`;
      }
'''
replace_once(input_anchor, input_replacement, 'region input helper')

replace_once(
    '<td>${inputHtml(row,"address")}</td><td>${inputHtml(row,"region","center")}</td><td>${inputHtml(row,"code","center")}</td>',
    '<td>${inputHtml(row,"address")}</td><td>${regionInputHtml(row)}</td><td>${inputHtml(row,"code","center")}</td>',
    'region render'
)

# 4) Filtering and region filter options use the effective inherited region.
replace_once(
    '            (!f.region || text(row.region)===f.region) &&',
    '            (!f.region || effectiveRegion(row,index,bases)===f.region) &&',
    'region filter'
)
replace_once(
    '        const regions = [...new Set(state.rows.map((row)=>text(row.region)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko",{numeric:true}));',
    '        const index = byId(); const bases = baseByCamp();\n        const regions = [...new Set(state.rows.map((row)=>effectiveRegion(row,index,bases)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko",{numeric:true}));',
    'region filter options'
)

# 5) Payload/CSV keep the same effective region so edited child rows cannot overwrite inheritance with stale values.
replace_once(
    '          camp_type:text(row.camp_type)||null,camp:text(row.camp)||null,mb_camp:text(row.mb_camp)||null,parent_camp_id:nullableId(row.parent_camp_id),receiving_sh_id:nullableId(row.receiving_sh_id),address:text(row.address)||null,region:text(row.region)||null,code:text(row.code)||null,latitude:text(row.latitude)||null,longitude:text(row.longitude)||null,description:text(row.description)||null',
    '          camp_type:text(row.camp_type)||null,camp:text(row.camp)||null,mb_camp:text(row.mb_camp)||null,parent_camp_id:nullableId(row.parent_camp_id),receiving_sh_id:nullableId(row.receiving_sh_id),address:text(row.address)||null,region:effectiveRegion(row)||null,code:text(row.code)||null,latitude:text(row.latitude)||null,longitude:text(row.longitude)||null,description:text(row.description)||null',
    'effective region payload'
)
replace_once(
    'lines.push([row.camp_type,row.camp,row.mb_camp,parent?.camp||"",row.parent_camp_id||"",resolved.row?.camp||"",resolved.row?.id||"",resolved.type,row.address,row.region,row.code,row.latitude,row.longitude,row.description].map(csvCell).join(","));',
    'lines.push([row.camp_type,row.camp,row.mb_camp,parent?.camp||"",row.parent_camp_id||"",resolved.row?.camp||"",resolved.row?.id||"",resolved.type,row.address,effectiveRegion(row,index,bases),row.code,row.latitude,row.longitude,row.description].map(csvCell).join(","));',
    'effective region CSV'
)

# 6) QR: mobile/mini child camps automatically use the resolved parent camp QR code.
old_open_qr = '''      async function openQr(row) {
        const code = text(row.code);
        if (!code) {
          setStatus("QR을 만들 캠프 코드가 없습니다.","err");
          return;
        }

        try {
          const qrCodeLib = await getQrCodeLib();
          state.currentQr = {code,label:text(row.camp)||code};
          dom.qrTitle.textContent = `${state.currentQr.label} QR`;
          dom.qrMeta.textContent = `${state.currentQr.label} · ${code}`;

          await qrCodeLib.toCanvas(dom.qrCanvas,code,{
            width:220,
            margin:2,
            errorCorrectionLevel:"M"
          });

          dom.qrModal.classList.add("show");
          dom.qrModal.setAttribute("aria-hidden","false");
        } catch (error) {
          console.error("QR 생성 실패", error);
          setStatus("QR 코드 라이브러리 로드 또는 생성에 실패했습니다.","err");
          alert("QR 코드를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
      }
'''
new_open_qr = '''      async function openQr(row) {
        const source = qrSource(row);
        const sourceRow = source.row || row;
        const code = text(sourceRow?.code);
        if (!code) {
          setStatus(source.inherited ? "상속할 본캠프 QR 코드가 없습니다." : "QR을 만들 캠프 코드가 없습니다.","err");
          return;
        }

        try {
          const qrCodeLib = await getQrCodeLib();
          const requestedLabel = text(row.camp) || code;
          const sourceLabel = text(sourceRow?.camp) || code;
          state.currentQr = {
            code,
            label:sourceLabel,
            requestedLabel,
            inherited:source.inherited
          };
          dom.qrTitle.textContent = `${requestedLabel} QR`;
          dom.qrMeta.textContent = source.inherited
            ? `${requestedLabel} → 본캠프 ${sourceLabel} QR 상속 · ${code}`
            : `${sourceLabel} · ${code}`;

          await qrCodeLib.toCanvas(dom.qrCanvas,code,{
            width:300,
            margin:2,
            errorCorrectionLevel:"M"
          });

          dom.qrModal.classList.add("show");
          dom.qrModal.setAttribute("aria-hidden","false");
        } catch (error) {
          console.error("QR 생성 실패", error);
          setStatus("QR 코드 라이브러리 로드 또는 생성에 실패했습니다.","err");
          alert("QR 코드를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
      }
'''
replace_once(old_open_qr, new_open_qr, 'QR source inheritance')

# 7) Downloaded QR gets a white footer with the actual source camp name.
old_download = '''      function closeQr(){dom.qrModal.classList.remove("show");dom.qrModal.setAttribute("aria-hidden","true");}
      function canvasBlob(){return new Promise((resolve)=>dom.qrCanvas.toBlob(resolve,"image/png"));}
      async function copyQr(){const blob=await canvasBlob();if(!blob)return;try{await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);setStatus("QR 이미지를 복사했습니다.","ok");}catch{downloadQr();}}
      async function downloadQr(){const blob=await canvasBlob();if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${state.currentQr?.label||"camp"}_QR.png`;a.click();URL.revokeObjectURL(url);}
'''
new_download = '''      function closeQr(){dom.qrModal.classList.remove("show");dom.qrModal.setAttribute("aria-hidden","true");}
      function canvasBlob(){return new Promise((resolve)=>dom.qrCanvas.toBlob(resolve,"image/png"));}
      function downloadCanvasBlob(){
        return new Promise((resolve) => {
          const qr = dom.qrCanvas;
          const padding = 22;
          const footer = 62;
          const out = document.createElement("canvas");
          out.width = qr.width + padding * 2;
          out.height = qr.height + padding * 2 + footer;
          const ctx = out.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0,0,out.width,out.height);
          ctx.drawImage(qr,padding,padding);
          ctx.fillStyle = "#0f172a";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = '700 24px "Noto Sans KR", Arial, sans-serif';
          const label = text(state.currentQr?.label) || "캠프";
          ctx.fillText(label,out.width/2,qr.height + padding * 2 + footer/2,Math.max(120,out.width-32));
          out.toBlob(resolve,"image/png");
        });
      }
      async function copyQr(){const blob=await canvasBlob();if(!blob)return;try{await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);setStatus("QR 이미지를 복사했습니다.","ok");}catch{downloadQr();}}
      async function downloadQr(){const blob=await downloadCanvasBlob();if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${state.currentQr?.label||"camp"}_QR.png`;a.click();URL.revokeObjectURL(url);}
'''
replace_once(old_download, new_download, 'QR download footer')

path.write_text(text, encoding='utf-8')

final = path.read_text(encoding='utf-8')
checks = [
    'canvas id="qrCanvas" width="300" height="300"',
    'function inheritedParent(row',
    'function effectiveRegion(row',
    'function qrSource(row',
    'regionInputHtml(row)',
    'effectiveRegion(row,index,bases)===f.region',
    'region:effectiveRegion(row)||null',
    '본캠프 ${sourceLabel} QR 상속',
    'width:300,',
    'function downloadCanvasBlob()',
    'ctx.fillText(label',
]
for check in checks:
    if check not in final:
        raise SystemExit(f'missing validation anchor: {check}')
