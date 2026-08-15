from pathlib import Path

path = Path('public/coupang_camp')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    text = text.replace(old, new, 1)


# QR preview: 220px -> 320px, with a slightly wider modal.
replace_once('.modalCard{width:min(440px,100%);', '.modalCard{width:min(520px,100%);', 'modal width')
replace_once('.qrBox{display:inline-flex;padding:12px;', '.qrBox{display:inline-flex;padding:16px;', 'qr box padding')
replace_once(
    '<canvas id="qrCanvas" width="220" height="220"></canvas>',
    '<canvas id="qrCanvas" width="320" height="320"></canvas>',
    'qr canvas size'
)

# Replace the QR-open logic. Mobile/mini rows always use the resolved parent camp QR code.
start = text.index('      async function openQr(row) {')
end = text.index('      function closeQr()', start)
new_open = r'''      function isMobileQrRow(row) {
        if (!row || isSubHub(row) || isBaseCampRow(row)) return false;
        const mb = text(row.mb_camp);
        return !!mb && mb !== "본캠프" && mb !== text(row.camp);
      }

      function qrDisplayLabel(row) {
        if (isMobileQrRow(row) && text(row.mb_camp)) return text(row.mb_camp);
        return text(row.camp) || text(row.code) || "camp";
      }

      function resolveQrTarget(row) {
        if (!isMobileQrRow(row)) {
          return { source:row, inherited:false };
        }

        const parent = currentParent(row);
        return { source:parent, inherited:true };
      }

      async function openQr(row) {
        const target = resolveQrTarget(row);
        const selectedLabel = qrDisplayLabel(row);

        if (target.inherited && !target.source) {
          setStatus(`${selectedLabel}의 상속 본캠프를 찾을 수 없어 QR을 만들 수 없습니다.`,"err");
          return;
        }

        const source = target.source || row;
        const code = text(source.code);
        const sourceLabel = text(source.camp) || code;

        if (!code) {
          setStatus(
            target.inherited
              ? `${selectedLabel}이 상속하는 본캠프(${sourceLabel || "미확인"})의 QR 코드가 없습니다.`
              : "QR을 만들 캠프 코드가 없습니다.",
            "err"
          );
          return;
        }

        try {
          const qrCodeLib = await getQrCodeLib();
          state.currentQr = {
            code,
            label:selectedLabel,
            sourceLabel:sourceLabel || selectedLabel,
            inherited:target.inherited
          };

          dom.qrTitle.textContent = `${selectedLabel} QR`;
          dom.qrMeta.textContent = target.inherited
            ? `${selectedLabel} · 본캠프 ${state.currentQr.sourceLabel} QR 자동 상속 · ${code}`
            : `${selectedLabel} · ${code}`;

          await qrCodeLib.toCanvas(dom.qrCanvas,code,{
            width:320,
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
text = text[:start] + new_open + text[end:]

# Replace close/copy/download helpers so downloaded PNG gets a camp-name footer.
start = text.index('      function closeQr()')
end = text.index('      function bind()', start)
new_helpers = r'''      function closeQr(){dom.qrModal.classList.remove("show");dom.qrModal.setAttribute("aria-hidden","true");}
      function canvasBlob(canvas=dom.qrCanvas){return new Promise((resolve)=>canvas.toBlob(resolve,"image/png"));}

      function safeQrFileName(value) {
        return (text(value) || "camp").replace(/[\\/:*?"<>|]+/g,"_");
      }

      async function buildQrDownloadCanvas() {
        const current = state.currentQr;
        if (!current?.code) return null;

        const qrCodeLib = await getQrCodeLib();
        const exportCanvas = document.createElement("canvas");
        const qrCanvas = document.createElement("canvas");
        const width = 480;
        const height = current.inherited ? 560 : 535;
        const qrSize = 420;
        const qrX = (width - qrSize) / 2;
        const qrY = 22;

        exportCanvas.width = width;
        exportCanvas.height = height;

        await qrCodeLib.toCanvas(qrCanvas,current.code,{
          width:qrSize,
          margin:2,
          errorCorrectionLevel:"M"
        });

        const ctx = exportCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0,0,width,height);
        ctx.drawImage(qrCanvas,qrX,qrY,qrSize,qrSize);

        try { await document.fonts?.ready; } catch {}

        const label = current.label || current.sourceLabel || current.code;
        let fontSize = 30;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#0f172a";

        do {
          ctx.font = `700 ${fontSize}px "문경감홍사과체", "Noto Sans KR", sans-serif`;
          if (ctx.measureText(label).width <= width - 48 || fontSize <= 18) break;
          fontSize -= 2;
        } while (fontSize > 18);

        ctx.fillText(label,width/2,478);

        if (current.inherited) {
          const inheritedText = `본캠프 ${current.sourceLabel} QR`;
          ctx.fillStyle = "#64748b";
          ctx.font = `500 18px "문경감홍사과체", "Noto Sans KR", sans-serif`;
          ctx.fillText(inheritedText,width/2,520);
        }

        return exportCanvas;
      }

      async function copyQr(){
        const blob=await canvasBlob();
        if(!blob)return;
        try{
          await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);
          setStatus("QR 이미지를 복사했습니다.","ok");
        }catch{
          downloadQr();
        }
      }

      async function downloadQr(){
        try {
          const exportCanvas = await buildQrDownloadCanvas();
          if (!exportCanvas) return;
          const blob = await canvasBlob(exportCanvas);
          if (!blob) return;
          const url=URL.createObjectURL(blob);
          const a=document.createElement("a");
          a.href=url;
          a.download=`${safeQrFileName(state.currentQr?.label)}_QR.png`;
          a.click();
          URL.revokeObjectURL(url);
          setStatus("캠프명이 포함된 QR 이미지를 다운로드했습니다.","ok");
        } catch (error) {
          console.error("QR 다운로드 실패", error);
          setStatus("QR 이미지 다운로드에 실패했습니다.","err");
        }
      }

'''
text = text[:start] + new_helpers + text[end:]

path.write_text(text, encoding='utf-8')

final = path.read_text(encoding='utf-8')
checks = [
    'width:min(520px,100%)',
    '<canvas id="qrCanvas" width="320" height="320"></canvas>',
    'function isMobileQrRow(row)',
    'function resolveQrTarget(row)',
    '본캠프 ${state.currentQr.sourceLabel} QR 자동 상속',
    'width:320,',
    'function buildQrDownloadCanvas()',
    'const qrSize = 420;',
    'ctx.fillText(label,width/2,478);',
    '캠프명이 포함된 QR 이미지를 다운로드했습니다.',
]
for check in checks:
    if check not in final:
        raise SystemExit(f'missing validation anchor: {check}')

if 'width:220,' in final:
    raise SystemExit('old 220px QR render size still exists')
