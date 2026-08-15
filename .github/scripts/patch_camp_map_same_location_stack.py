from pathlib import Path
import re

PATHS = [Path('public/coupang_camp_map'), Path('coupang_camp_map')]

for path in PATHS:
    text = path.read_text(encoding='utf-8')

    text = text.replace('const LABEL_STACK_GAP = 2;', 'const LABEL_STACK_GAP = 0;')

    if 'function markerDistanceMeters(a, b)' not in text:
        anchor = '      function buildMarkerGroups(rows) {'
        idx = text.find(anchor)
        if idx < 0:
            raise SystemExit(f'{path}: buildMarkerGroups anchor missing')
        helper = '''      function markerDistanceMeters(a, b) {
        const aLat = Number(a?.latitude);
        const aLng = Number(a?.longitude);
        const bLat = Number(b?.latitude);
        const bLng = Number(b?.longitude);
        if (![aLat,aLng,bLat,bLng].every(Number.isFinite)) return Infinity;
        const rad = Math.PI / 180;
        const dLat = (bLat - aLat) * rad;
        const dLng = (bLng - aLng) * rad;
        const lat1 = aLat * rad;
        const lat2 = bLat * rad;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      }

      function rowsShareSubHubRelation(a, b) {
        const aType = text(a?.camp_type).toUpperCase();
        const bType = text(b?.camp_type).toUpperCase();
        const aId = text(a?.id);
        const bId = text(b?.id);
        const aSh = text(a?.effective_receiving_sh_id);
        const bSh = text(b?.effective_receiving_sh_id);
        return (
          (aType === "SUB_HUB" && aId && bSh === aId) ||
          (bType === "SUB_HUB" && bId && aSh === bId)
        );
      }

      function shouldMergeSelectedRelationRows(a, b) {
        if (overlapMarkerKey(a) === overlapMarkerKey(b)) return true;
        const distance = markerDistanceMeters(a, b);
        if (distance <= 4) return true;
        if (rowsShareSubHubRelation(a, b) && distance <= 18) return true;
        return false;
      }

'''
        text = text[:idx] + helper + text[idx:]

    # Replace buildMarkerGroups with optional near-relation merge support, once.
    start = text.find('      function buildMarkerGroups(rows) {')
    end = text.find('\n      function rectanglesOverlap', start)
    if start < 0 or end < 0:
        raise SystemExit(f'{path}: buildMarkerGroups block bounds missing')

    old_block = text[start:end]
    if 'mergeNearbyRelated = false' not in old_block:
        new_block = '''      function buildMarkerGroups(rows, mergeNearbyRelated = false) {
        const groupedRows = [];

        if (!mergeNearbyRelated) {
          const grouped = new Map();
          for (const row of rows) {
            const key = overlapMarkerKey(row);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(row);
          }
          for (const [key, groupRows] of grouped.entries()) {
            groupedRows.push({ key, groupRows });
          }
        } else {
          for (const row of rows) {
            let group = groupedRows.find(candidate =>
              candidate.groupRows.some(existing => shouldMergeSelectedRelationRows(existing, row))
            );
            if (!group) {
              group = { key: `near:${rowId(row)}`, groupRows: [] };
              groupedRows.push(group);
            }
            group.groupRows.push(row);
          }
        }

        return groupedRows.map(({ key, groupRows }) => {
          groupRows.sort(compareOverlapRows);

          const items = groupRows.map(row => ({
            row,
            metrics: markerVisualMetrics(row)
          }));

          const width = Math.max(...items.map(item => item.metrics.width));
          const height =
            items.reduce((sum, item) => sum + item.metrics.bubbleHeight, 0) +
            Math.max(0, items.length - 1) * LABEL_STACK_GAP +
            items[items.length - 1].metrics.pointerHeight;

          const validRows = groupRows.filter(row =>
            Number.isFinite(Number(row?.latitude)) && Number.isFinite(Number(row?.longitude))
          );
          const latitude = validRows.length
            ? validRows.reduce((sum, row) => sum + Number(row.latitude), 0) / validRows.length
            : Number(groupRows[0]?.latitude);
          const longitude = validRows.length
            ? validRows.reduce((sum, row) => sum + Number(row.longitude), 0) / validRows.length
            : Number(groupRows[0]?.longitude);

          return {
            key,
            items,
            width,
            height,
            latitude,
            longitude,
            hasSubHub: groupRows.some(row => text(row?.camp_type).toUpperCase() === "SUB_HUB"),
            sortLabel: groupRows.map(overlapSortLabel).join(" ")
          };
        });
      }
'''
        text = text[:start] + new_block + text[end:]

    text = text.replace('const groups = buildMarkerGroups(relatedRows);', 'const groups = buildMarkerGroups(relatedRows, true);')

    # Render all rows of a merged selected-relation group at the shared group anchor.
    text = text.replace(
        '''              position: new kakao.maps.LatLng(
                item.row.latitude,
                item.row.longitude
              ),''',
        '''              position: new kakao.maps.LatLng(
                group.latitude,
                group.longitude
              ),'''
    )

    # Tight stack: non-bottom labels do not reserve pointer height.
    old_height = '''            heightBelow +=
              item.metrics.bubbleHeight +
              (showPointer ? item.metrics.pointerHeight : 0) +
              LABEL_STACK_GAP;'''
    new_height = '''            heightBelow +=
              item.metrics.bubbleHeight +
              (showPointer ? item.metrics.pointerHeight : 0);'''
    text = text.replace(old_height, new_height)

    path.write_text(text, encoding='utf-8')

    final = path.read_text(encoding='utf-8')
    required = [
        'const LABEL_STACK_GAP = 0;',
        'function markerDistanceMeters(a, b)',
        'function shouldMergeSelectedRelationRows(a, b)',
        'buildMarkerGroups(relatedRows, true)',
        'group.latitude',
        'group.longitude',
    ]
    for token in required:
        if token not in final:
            raise SystemExit(f'{path}: missing {token}')
