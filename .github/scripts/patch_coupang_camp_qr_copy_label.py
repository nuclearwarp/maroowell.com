from pathlib import Path
import re

for path in [Path('public/coupang_camp'), Path('coupang_camp')]:
    text = path.read_text(encoding='utf-8')

    old_meta = '''          dom.qrTitle.textContent = `${requestedLabel} QR`;
          dom.qrMeta.textContent = source.inherited
            ? `${requestedLabel} → 본캠프 ${sourceLabel} QR 상속 · ${code}`
            : `${sourceLabel} · ${code}`;'''
    new_meta = '''          dom.qrTitle.textContent = `${sourceLabel} QR`;
          dom.qrMeta.textContent = sourceLabel;'''
    if old_meta in text:
        text = text.replace(old_meta, new_meta, 1)
    elif new_meta not in text:
        raise SystemExit(f'{path}: QR meta anchor not found')

    pattern = re.compile(
        r'      function downloadCanvasBlob\(\)\{[\s\S]*?^      \}\n'
        r'      async function copyQr\(\)\{[^\n]*\}\n'
        r'      async function downloadQr\(\)\{[^\n]*\}',
        re.MULTILINE,
    )
    replacement = '''      function downloadCanvasBlob(){
        return new Promise((resolve) => {
          const qr = dom.qrCanvas;
          const qrSize = 360;
          const padding = 28;
          const footer = 82;
          const out = document.createElement("canvas");
          out.width = qrSize + padding * 2;
          out.height = qrSize + padding * 2 + footer;
          const ctx = out.getContext("2d");
          if (!ctx) { resolve(null); return; }

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0,0,out.width,out.height);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(qr,0,0,qr.width,qr.height,padding,padding,qrSize,qrSize);

          const label = text(state.currentQr?.label) || "캠프";
          ctx.fillStyle = "#0f172a";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `700 30px ${getComputedStyle(document.body).fontFamily}`;
          ctx.fillText(label,out.width/2,qrSize + padding * 2 + footer/2,Math.max(160,out.width-40));
          out.toBlob(resolve,"image/png");
        });
      }
      async function copyQr(){const blob=await downloadCanvasBlob();if(!blob)return;try{await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);setStatus("캠프명이 포함된 QR 이미지를 복사했습니다.","ok");}catch{downloadQr();}}
      async function downloadQr(){const blob=await downloadCanvasBlob();if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${state.currentQr?.label||"camp"}_QR.png`;a.click();URL.revokeObjectURL(url);}'''

    if pattern.search(text):
        text = pattern.sub(replacement, text, count=1)
    elif 'const qrSize = 360;' not in text or 'copyQr(){const blob=await downloadCanvasBlob()' not in text:
        raise SystemExit(f'{path}: QR export block not found')

    path.write_text(text, encoding='utf-8')

    final = path.read_text(encoding='utf-8')
    required = [
        'dom.qrTitle.textContent = `${sourceLabel} QR`;',
        'dom.qrMeta.textContent = sourceLabel;',
        'const qrSize = 360;',
        'const footer = 82;',
        'ctx.imageSmoothingEnabled = false;',
        'copyQr(){const blob=await downloadCanvasBlob()',
        '캠프명이 포함된 QR 이미지를 복사했습니다.',
    ]
    for item in required:
        if item not in final:
            raise SystemExit(f'{path}: missing {item}')
