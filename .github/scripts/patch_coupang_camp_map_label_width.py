from pathlib import Path

paths = [Path('public/coupang_camp_map'), Path('coupang_camp_map')]

old = '''      function markerTextWidth(label, fontSize) {
        const scale = fontSize / 9.5;

        return Array.from(label).reduce((sum, ch) => {
          return sum + (/^[\\x20-\\x7E]$/.test(ch) ? 5.6 : 9.2) * scale;
        }, 0);
      }

      function markerLabelWidth(lines, fontSizes, isSubHub, isMobile) {
        const widest = Math.max(
          ...lines.map((line, index) => {
            const fontSize = fontSizes[index] || fontSizes[0] || 10.5;
            return markerTextWidth(line, fontSize);
          })
        );

        // SUB_HUB 코드는 영문 대문자·숫자·언더바 조합이 많고,
        // 실제 굵은 폰트 폭이 계산값보다 넓을 수 있어 좌우 여백을 크게 준다.
        const horizontalPadding = isSubHub ? 36 : isMobile ? 22 : 20;
        const minimum = isSubHub ? 64 : isMobile ? 52 : 42;
        const maximum = isSubHub ? 180 : isMobile ? 150 : 132;

        return Math.max(
          minimum,
          Math.min(maximum, Math.ceil(widest + horizontalPadding))
        );
      }
'''

new = '''      let markerMeasureContext = null;

      function markerTextWidth(label, fontSize, fontWeight = 900) {
        try {
          if (!markerMeasureContext) {
            const canvas = document.createElement("canvas");
            markerMeasureContext = canvas.getContext("2d");
          }

          if (markerMeasureContext) {
            markerMeasureContext.font = `${fontWeight} ${fontSize}px Arial, "Noto Sans KR", sans-serif`;
            return Math.ceil(markerMeasureContext.measureText(String(label || "")).width);
          }
        } catch {}

        const scale = fontSize / 9.5;
        return Array.from(String(label || "")).reduce((sum, ch) => {
          return sum + (/^[\\x20-\\x7E]$/.test(ch) ? 6.3 : 10.2) * scale;
        }, 0);
      }

      function markerLabelWidth(lines, fontSizes, isSubHub, isMobile) {
        const widest = Math.max(
          ...lines.map((line, index) => {
            const fontSize = fontSizes[index] || fontSizes[0] || 10.5;
            const fontWeight = index === 0 ? 900 : 800;
            return markerTextWidth(line, fontSize, fontWeight);
          })
        );

        // 실제 렌더링 폭에 브라우저/폰트 차이 안전 여백을 더해 끝 글자 잘림을 방지한다.
        const horizontalPadding = isSubHub ? 42 : isMobile ? 34 : 32;
        const minimum = isSubHub ? 72 : isMobile ? 64 : 56;
        const maximum = isSubHub ? 260 : isMobile ? 240 : 220;

        return Math.max(
          minimum,
          Math.min(maximum, Math.ceil(widest + horizontalPadding))
        );
      }
'''

for path in paths:
    text = path.read_text(encoding='utf-8')
    if new in text:
        continue
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: width block expected once, found {count}')
    text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')

    final = path.read_text(encoding='utf-8')
    checks = [
        'let markerMeasureContext = null;',
        'measureText(String(label || ""))',
        'const horizontalPadding = isSubHub ? 42 : isMobile ? 34 : 32;',
        'const maximum = isSubHub ? 260 : isMobile ? 240 : 220;'
    ]
    for check in checks:
        if check not in final:
            raise SystemExit(f'{path}: missing {check}')
