const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

function configHarness(response) {
  const requests = [];
  const window = {
    addEventListener() {},
    fetch: async (url, init) => {
      requests.push({ url: new URL(url), init });
      return response();
    }
  };
  vm.runInNewContext(fs.readFileSync('public/config.js', 'utf8'), {
    window, location: { href: 'https://maroowell.com/maroowell_account', pathname: '/maroowell_account' },
    URL, Headers, Response
  });
  const query = (body, auth = 'Bearer test-session') => window.fetch('https://example.invalid/account/query', {
    method: 'POST', headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(body)
  });
  return { requests, query };
}

test('statistics uses one RPC and preserves both month boundaries', async () => {
  const h = configHarness(() => new Response(JSON.stringify({ ok: true, rows: [], source_row_count: 0 })));
  const result = await h.query({ statisticsVersion: 1, period: { year: 2026, startMonth: 3, endMonth: 5 } });
  assert.equal(result.status, 200);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url.pathname, '/rest/v1/rpc/mw_account_statistics');
  assert.deepEqual(JSON.parse(h.requests[0].init.body), { p_year: 2026, p_start_month: 3, p_end_month: 5 });
});

test('already-open legacy pages keep both date filters and stable pagination', async () => {
  const h = configHarness(() => new Response('[]'));
  await h.query({ period: { year: 2026, startMonth: 3, endMonth: 5 } });
  const params = h.requests[0].url.searchParams;
  assert.deepEqual(params.getAll('date_month'), ['gte.3', 'lte.5']);
  assert.match(params.get('order'), /row_id.asc$/);
  assert.doesNotMatch(params.get('select'), /price|tracking_number|product_name|\*/);
});

test('permission failures do not fall back to a broader query', async () => {
  const h = configHarness(() => new Response('{"message":"통계 조회 권한이 필요합니다."}', { status: 403 }));
  assert.equal((await h.query({ statisticsVersion: 1 })).status, 403);
  assert.equal(h.requests.length, 1);
  assert.equal((await h.query({ statisticsVersion: 1 }, '')).status, 401);
  assert.equal(h.requests.length, 1);
});

function statisticsHarness(html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const script = scripts.find(s => s.includes('function buildStats()'));
  assert.ok(script);
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', textContent: '' });
    return elements.get(id);
  } };
  const context = vm.createContext({ window: {}, document, console });
  const instrumented = script.replace('}boot();', `}
    renderAll = () => {};
    globalThis.calculate = (rows, filters) => {
      for (const id of ['currentCampInput','currentRouteInput','pastRoutesInput','searchInput','waveSelect']) els[id].value = filters[id] || '';
      state.rawRows = structuredClone(rows).filter(isRawRow).filter(row => !isExcludedStatsRow(row));
      buildStats();
      return JSON.parse(JSON.stringify(state.stats));
    };`);
  context.structuredClone = structuredClone;
  vm.runInContext(instrumented, context);
  return context.calculate;
}

test('grouped rows preserve all four statistics tables, counts, dates, and filters', () => {
  const html = fs.readFileSync('public/maroowell_account', 'utf8');
  const calculate = statisticsHarness(html);
  // Raw rows are still supported. Their independent expected totals are checked below.
  const base = { classify: '배송', id: 'driver@df', source_sheet: '정산Raw', date_year: 2026, date_month: 8 };
  const groups = [
    { ...base, camp: '대구3', wave: '주간', route: '329A01', delivery_date: '2026-07-26', parcel: 200, return: 10, row_count: 2 },
    { ...base, camp: '대구3', wave: '주간', route: '329A02', delivery_date: '2026-08-01', parcel: 120, return: 6, row_count: 3 },
    { ...base, camp: '대구2', wave: '주간', route: '211A01', delivery_date: '2026-07-25', parcel: 80, return: 4, row_count: 2 },
    { ...base, camp: 'M_익산1', wave: '심야', route: '405C01', delivery_date: '2026-08-02', parcel: 60, return: 0, row_count: 2 },
    { ...base, camp: '대구3', wave: '주간', route: '329A01', delivery_date: null, parcel: 4, return: 2, row_count: 2 },
    { ...base, classify: '분실파손', source_sheet: '분실파손List', camp: '대구3', route: '329A01', parcel: 1000, row_count: 2 },
    { ...base, classify: '미계약 라우트', camp: '대구3', route: '-', parcel: 1000, row_count: 2 }
  ];
  const raw = groups.flatMap(({ row_count, ...row }) => Array.from({ length: row_count }, () => ({
    ...row, parcel: row.parcel / row_count, return: (row.return || 0) / row_count
  })));
  const filters = [
    {}, { currentCampInput: '대구3' },
    { currentCampInput: '대구3', currentRouteInput: '329A', pastRoutesInput: '대구2/211' },
    { currentCampInput: 'M익산1', currentRouteInput: '405C', waveSelect: '야간' },
    { searchInput: 'driver@df' }, { searchInput: '2026-07-26' }, { searchInput: 'no-match' },
    { currentCampInput: '대구3', currentRouteInput: '329A01,329A02', waveSelect: '주간' }
  ];
  for (const filter of filters) assert.deepEqual(calculate(groups, filter), calculate(raw, filter));
  const total = calculate(groups, {}).total;
  assert.equal(total.rows, 11);
  assert.equal(total.parcel, 464);
  assert.equal(total.return, 22);
  assert.equal(total.quantity, 486);
  assert.equal(total.days, 4);
});
