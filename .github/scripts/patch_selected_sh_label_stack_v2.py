from pathlib import Path

paths = [Path('public/coupang_camp_map'), Path('coupang_camp_map')]

for path in paths:
    text = path.read_text(encoding='utf-8')

    old_merge = '''      function shouldMergeSelectedRelationRows(a, b) {
        if (overlapMarkerKey(a) === overlapMarkerKey(b)) return true;
        const distance = markerDistanceMeters(a, b);
        if (distance <= 4) return true;
        if (rowsShareSubHubRelation(a, b) && distance <= 18) return true;
        return false;
      }
'''
    new_merge = '''      function shouldMergeSelectedRelationRows(a, b) {
        if (overlapMarkerKey(a) === overlapMarkerKey(b)) return true;

        const aAddress = lower(a?.address).replace(/\\s+/g, " ");
        const bAddress = lower(b?.address).replace(/\\s+/g, " ");
        if (aAddress && bAddress && aAddress === bAddress) return true;

        const distance = markerDistanceMeters(a, b);
        if (distance <= 4) return true;
        if (rowsShareSubHubRelation(a, b) && distance <= 300) return true;
        return false;
      }
'''
    if old_merge in text:
        text = text.replace(old_merge, new_merge, 1)
    elif new_merge not in text:
        raise SystemExit(f'{path}: merge anchor not found')

    start = text.find('      function makeForcedRelationLabelImage(row, offsetX = 0, offsetY = 0) {')
    end = text.find('\n      function renderSelectedSubHubMarkers() {', start)
    if start == -1 or end == -1:
        raise SystemExit(f'{path}: forced label image function not found')

    new_image = '''      function makeForcedRelationLabelImage(row, offsetX = 0, offsetY = 0) {
        const metrics = markerVisualMetrics(row);
        const key = [
          "forced-relation-flat",
          metrics.type,
          metrics.isMobile ? "mobile" : "base",
          ...metrics.lines,
          ...metrics.fontSizes,
          Math.round(offsetX),
          Math.round(offsetY)
        ].join("|");

        if (state.markerImages.has(key)) return state.markerImages.get(key);

        const labelWidth = metrics.width;
        const labelHeight = metrics.bubbleHeight;
        const padding = 4;
        const minX = Math.min(0, offsetX - labelWidth / 2);
        const maxX = Math.max(0, offsetX + labelWidth / 2);
        const minY = Math.min(0, offsetY - labelHeight);
        const maxY = Math.max(0, offsetY);
        const imageWidth = Math.ceil(maxX - minX + padding * 2);
        const imageHeight = Math.ceil(maxY - minY + padding * 2);
        const anchorX = -minX + padding;
        const anchorY = -minY + padding;
        const labelLeft = anchorX + offsetX - labelWidth / 2;
        const labelTop = anchorY + offsetY - labelHeight;
        const bubbleColor = markerLabelBackground(metrics);
        const textColor = markerLabelColor(metrics);
        const borderColor = metrics.isMobile ? "#e0f2fe" : "#ffffff";
        const centerX = labelLeft + labelWidth / 2;

        const textSvg = metrics.lines.length > 1
          ? [
              `<text x="${centerX}" y="${labelTop + 12.5}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans KR, sans-serif" font-size="${metrics.fontSizes[0]}" font-weight="900" fill="${textColor}">${escapeSvgText(metrics.lines[0])}</text>`,
              `<text x="${centerX}" y="${labelTop + 29.2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans KR, sans-serif" font-size="${metrics.fontSizes[1]}" font-weight="800" fill="${textColor}">${escapeSvgText(metrics.lines[1])}</text>`
            ].join("")
          : `<text x="${centerX}" y="${labelTop + 1 + metrics.bubbleHeight / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans KR, sans-serif" font-size="${metrics.fontSizes[0]}" font-weight="900" fill="${textColor}">${escapeSvgText(metrics.lines[0])}</text>`;

        const svg = [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" overflow="visible">`,
          '<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#0f172a" flood-opacity=".28"/></filter></defs>',
          '<g filter="url(#shadow)">',
          `<rect x="${labelLeft}" y="${labelTop}" width="${labelWidth}" height="${metrics.bubbleHeight}" rx="7" fill="${bubbleColor}" stroke="${borderColor}" stroke-width="1.2"/>`,
          '</g>',
          textSvg,
          '</svg>'
        ].join("");

        const image = new kakao.maps.MarkerImage(
          "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
          new kakao.maps.Size(imageWidth, imageHeight),
          { offset: new kakao.maps.Point(anchorX, anchorY) }
        );
        state.markerImages.set(key, image);
        return image;
      }
'''
    text = text[:start] + new_image + text[end:]

    text = text.replace(
        '            const item = group.items[index];\n            const showPointer = index === group.items.length - 1;\n',
        '            const item = group.items[index];\n',
        1,
    )
    text = text.replace(
        '            heightBelow +=\n              item.metrics.bubbleHeight +\n              (showPointer ? item.metrics.pointerHeight : 0);',
        '            heightBelow += item.metrics.bubbleHeight;',
        1,
    )

    old_relation = '''      function renderRelationLines() {
        const unique = new Set();
'''
    new_relation = '''      function renderRelationLines() {
        if (selectedSubHubId()) return;

        const unique = new Set();
'''
    if old_relation in text:
        text = text.replace(old_relation, new_relation, 1)
    elif new_relation not in text:
        raise SystemExit(f'{path}: relation line anchor not found')

    path.write_text(text, encoding='utf-8')

    final = path.read_text(encoding='utf-8')
    required = [
        'aAddress && bAddress && aAddress === bAddress',
        'rowsShareSubHubRelation(a, b) && distance <= 300',
        'forced-relation-flat',
        'heightBelow += item.metrics.bubbleHeight;',
        'if (selectedSubHubId()) return;',
    ]
    for item in required:
        if item not in final:
            raise SystemExit(f'{path}: missing {item}')
