/**
 * Cloudflare Worker - 우편번호 경계 API
 *
 * 목적:
 * - https://www.juso.go.kr/api/totalMap/selectKarbSbdList 호출 안정화
 * - 브라우저 성공 요청과 더 비슷한 문맥(세션/헤더)으로 호출
 * - 간헐적 502/522 발생 시 재시도 및 디버깅 정보 강화
 *
 * 프론트(index.html)는 아래 형식만 유지되면 그대로 동작:
 * {
 *   zipcode,
 *   srid: 5179,
 *   center5179,
 *   polygon5179,
 *   metadata
 * }
 */

const JUSO_ORIGIN = "https://www.juso.go.kr";
const JUSO_MAP_URL = `${JUSO_ORIGIN}/map/totalMapView`;
const JUSO_API_URL = `${JUSO_ORIGIN}/api/totalMap/selectKarbSbdList`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/146.0.0.0 Safari/537.36";

const SEC_CH_UA = '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"';
const SEC_CH_UA_MOBILE = "?0";
const SEC_CH_UA_PLATFORM = '"Windows"';

const RETRY_DELAYS_MS = [0, 250, 900];
const ERROR_BODY_SNIPPET = 800;
const BOOTSTRAP_TIMEOUT_MS = 6000;
const API_TIMEOUT_MS = 9000;

function timeoutError(label, ms) {
  const err = new Error(`${label} timeout after ${ms}ms`);
  err.name = "AbortError";
  return err;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timeoutError("upstream fetch", timeoutMs)), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env, ctx) {
    function corsHeaders() {
      return {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
    }

    function jsonResp(obj, status = 200) {
      return new Response(JSON.stringify(obj), {
        status,
        headers: corsHeaders(),
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(),
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    try {
      const url = new URL(request.url);
      const zipcode = (url.searchParams.get("zipcode") || "").trim();
      const debug = url.searchParams.get("debug") === "1";

      if (!/^\d{5}$/.test(zipcode)) {
        return jsonResp({ error: "유효한 5자리 zipcode 쿼리 파라미터가 필요함" }, 400);
      }

      const upstream = await fetchFromJuso(zipcode, debug);

      if (!upstream.ok) {
        return jsonResp(
          {
            error: "주소정보 API 호출 실패",
            status: upstream.status || 0,
            attemptCount: upstream.attemptCount,
            variant: upstream.variant || null,
            detail: upstream.detail || "",
            responseSnippet: upstream.responseSnippet || "",
          },
          502
        );
      }

      const data = upstream.data;

      if (!data?.results || !Array.isArray(data.results.content)) {
        return jsonResp(
          {
            error: "응답 데이터 형식 오류",
            response: data,
          },
          500
        );
      }

      if (data.results.content.length === 0) {
        return jsonResp(
          {
            error: "해당 우편번호의 경계 데이터가 없음",
            zipcode,
          },
          404
        );
      }

      const item = data.results.content[0];

      if (!item?.geom) {
        return jsonResp(
          {
            error: "geom 필드가 없음",
            item,
          },
          500
        );
      }

      let geojson;
      try {
        geojson = typeof item.geom === "string" ? JSON.parse(item.geom) : item.geom;
      } catch (e) {
        return jsonResp(
          {
            error: "GeoJSON 파싱 실패",
            detail: String(e),
            geom: item.geom,
          },
          500
        );
      }

      if (geojson?.type !== "MultiPolygon" || !Array.isArray(geojson.coordinates)) {
        return jsonResp(
          {
            error: "예상치 못한 geometry 타입",
            type: geojson?.type ?? null,
          },
          500
        );
      }

      const polygon5179 = geojson.coordinates;
      const center5179 = computeCenter5179(polygon5179);

      const metadata = {
        ctpvNm: item.ctpvNm ?? null,
        sigNm: item.sigNm ?? null,
        sbdno: item.sbdno ?? zipcode,
        lgvReplcCd: item.lgvReplcCd ?? null,
      };

      return jsonResp({
        zipcode,
        srid: 5179,
        center5179,
        polygon5179,
        metadata,
      });
    } catch (err) {
      return jsonResp(
        {
          error: "Worker 내부 예외 발생",
          detail: String(err),
          stack: err?.stack || null,
        },
        500
      );
    }
  },
};

function computeCenter5179(polygon5179) {
  try {
    if (
      !Array.isArray(polygon5179) ||
      !polygon5179.length ||
      !Array.isArray(polygon5179[0]) ||
      !polygon5179[0].length ||
      !Array.isArray(polygon5179[0][0]) ||
      !polygon5179[0][0].length
    ) {
      return null;
    }

    const firstRing = polygon5179[0][0];
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const pt of firstRing) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const x = Number(pt[0]);
      const y = Number(pt[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      sumX += x;
      sumY += y;
      count += 1;
    }

    if (!count) return null;
    return [sumX / count, sumY / count];
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBrowserLikeHeaders(cookieHeader = "") {
  const headers = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Content-Type": "application/json",
    "Origin": JUSO_ORIGIN,
    "Referer": JUSO_MAP_URL,
    "User-Agent": USER_AGENT,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "sec-ch-ua": SEC_CH_UA,
    "sec-ch-ua-mobile": SEC_CH_UA_MOBILE,
    "sec-ch-ua-platform": SEC_CH_UA_PLATFORM,
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
  };

  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  return headers;
}

function buildBootstrapHeaders() {
  return {
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": USER_AGENT,
    "Referer": JUSO_ORIGIN,
    "sec-ch-ua": SEC_CH_UA,
    "sec-ch-ua-mobile": SEC_CH_UA_MOBILE,
    "sec-ch-ua-platform": SEC_CH_UA_PLATFORM,
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };
}

const JUSO_SIDO_PROFILES = [
  { ctpvCd: "11", sidoVal: "110001", label: "서울특별시" },
  { ctpvCd: "26", sidoVal: "260001", label: "부산광역시" },
  { ctpvCd: "27", sidoVal: "270001", label: "대구광역시" },
  { ctpvCd: "28", sidoVal: "280001", label: "인천광역시" },
  { ctpvCd: "29", sidoVal: "290001", label: "광주광역시" },
  { ctpvCd: "30", sidoVal: "300001", label: "대전광역시" },
  { ctpvCd: "31", sidoVal: "310001", label: "울산광역시" },
  { ctpvCd: "36", sidoVal: "361102", label: "세종특별자치시" },
  { ctpvCd: "41", sidoVal: "410001", label: "경기도" },
  { ctpvCd: "51", sidoVal: "510001", label: "강원특별자치도" },
  { ctpvCd: "43", sidoVal: "430001", label: "충청북도" },
  { ctpvCd: "44", sidoVal: "440001", label: "충청남도" },
  { ctpvCd: "45", sidoVal: "450001", label: "전북특별자치도" },
  { ctpvCd: "46", sidoVal: "460001", label: "전라남도" },
  { ctpvCd: "47", sidoVal: "470001", label: "경상북도" },
  { ctpvCd: "48", sidoVal: "480001", label: "경상남도" },
  { ctpvCd: "50", sidoVal: "500001", label: "제주특별자치도" }
];

const JUSO_SIDO_DATA = [
  { label: "선택", value: null },
  ...JUSO_SIDO_PROFILES.map((row) => ({ value: row.sidoVal, label: row.label })),
];

const JUSO_EMPTY_SGG_DATA = [
  { label: "선택", value: null }
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeBasePageable() {
  return {
    first: 0,
    totalRecords: 0,
    currentRecords: 0,
    totalPages: 0,
    page: 0,
    size: 10,
    linkSize: 5,
    orders: [{ property: "", direction: "" }],
  };
}

function buildPayloadVariants(zipcode) {
  const districtNo = String(zipcode || "").trim();

  const provinceVariants = JUSO_SIDO_PROFILES.map((profile) => ({
    name: `province_${profile.ctpvCd}_${profile.label}`,
    body: {
      params_sido_val: profile.sidoVal,
      params_sido_data: cloneJson(JUSO_SIDO_DATA),
      params_sgg_val: null,
      params_sgg_data: cloneJson(JUSO_EMPTY_SGG_DATA),
      search_result: [],
      result_count: 0,
      result_offset: 0,
      ctpvCd: profile.ctpvCd,
      lgvReplcCd: "",
      districtNo,
      pageable: makeBasePageable(),
    },
  }));

  return [
    ...provinceVariants,
    {
      name: "browser_like_empty_string",
      body: {
        params_sido_val: "",
        params_sido_data: [],
        params_sgg_val: "",
        params_sgg_data: [],
        search_result: [],
        result_count: 0,
        result_offset: 0,
        ctpvCd: "",
        lgvReplcCd: "",
        districtNo,
        pageable: makeBasePageable(),
      },
    },
    {
      name: "legacy_null_style",
      body: {
        params_sido_val: null,
        params_sido_data: [],
        params_sgg_val: null,
        params_sgg_data: [],
        search_result: [],
        result_count: 0,
        result_offset: 0,
        ctpvCd: "",
        lgvReplcCd: "",
        districtNo,
        pageable: makeBasePageable(),
      },
    },
  ];
}

function snippet(text, maxLen = ERROR_BODY_SNIPPET) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > maxLen ? s.slice(0, maxLen) + "..." : s;
}

function collectSetCookieHeaders(headers) {
  try {
    if (typeof headers.getSetCookie === "function") {
      const rows = headers.getSetCookie();
      if (Array.isArray(rows) && rows.length) return rows;
    }
  } catch {}

  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function extractCookieHeaderFromSetCookie(setCookieHeaders) {
  const wanted = ["WMONID", "JSESSIONID"];
  const found = new Map();

  for (const raw of setCookieHeaders || []) {
    const text = String(raw || "");
    for (const name of wanted) {
      const re = new RegExp(`${name}=([^;,\\s]+)`, "i");
      const m = text.match(re);
      if (m?.[1]) {
        found.set(name, `${name}=${m[1]}`);
      }
    }
  }

  return [...found.values()].join("; ");
}

async function bootstrapJusoSession() {
  try {
    const res = await fetchWithTimeout(JUSO_MAP_URL, {
      method: "GET",
      headers: buildBootstrapHeaders(),
      redirect: "follow",
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    }, BOOTSTRAP_TIMEOUT_MS);

    const setCookieHeaders = collectSetCookieHeaders(res.headers);
    const cookieHeader = extractCookieHeaderFromSetCookie(setCookieHeaders);

    return {
      ok: res.ok,
      status: res.status,
      cookieHeader,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      cookieHeader: "",
      detail: String(e),
    };
  }
}

async function postSelectKarbSbdList(zipcode, payloadVariant, cookieHeader) {
  const res = await fetchWithTimeout(JUSO_API_URL, {
    method: "POST",
    headers: buildBrowserLikeHeaders(cookieHeader),
    body: JSON.stringify(payloadVariant.body),
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  }, API_TIMEOUT_MS);

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  return {
    ok: res.ok,
    status: res.status,
    text,
    data,
    variant: payloadVariant.name,
  };
}

async function fetchFromJuso(zipcode, debug = false) {
  let lastFailure = {
    ok: false,
    status: 0,
    attemptCount: 0,
    variant: null,
    detail: "",
    responseSnippet: "",
  };

  const payloadVariants = buildPayloadVariants(zipcode);

  for (let retryIndex = 0; retryIndex < RETRY_DELAYS_MS.length; retryIndex++) {
    const delay = RETRY_DELAYS_MS[retryIndex];
    if (delay > 0) await sleep(delay);

    const session = await bootstrapJusoSession();
    const cookieHeader = session.cookieHeader || "";
    let variantStep = 0;

    for (const payloadVariant of payloadVariants) {
      variantStep += 1;
      const attemptCount = retryIndex * payloadVariants.length + variantStep;

      try {
        const result = await postSelectKarbSbdList(zipcode, payloadVariant, cookieHeader);

        if (result.ok && result.data?.results?.content?.length) {
          return {
            ok: true,
            status: result.status,
            data: result.data,
            attemptCount,
            variant: payloadVariant.name,
          };
        }

        lastFailure = {
          ok: false,
          status: result.status || 0,
          attemptCount,
          variant: payloadVariant.name,
          detail:
            result.data?.message ||
            result.data?.error ||
            `HTTP ${result.status || 0}`,
          responseSnippet: snippet(result.text),
        };
      } catch (e) {
        lastFailure = {
          ok: false,
          status: 0,
          attemptCount,
          variant: payloadVariant.name,
          detail: (e && e.name === "AbortError") ? `timeout after ${API_TIMEOUT_MS}ms` : String(e),
          responseSnippet: "",
        };
      }

      if (debug) {
        console.log(
          JSON.stringify({
            tag: "ZIP_API_ATTEMPT",
            zipcode,
            retryIndex,
            attempt: attemptCount,
            variant: payloadVariant.name,
            sessionStatus: session.status,
            hasCookie: !!cookieHeader,
            payloadPreview: payloadVariant.body ? {
              params_sido_val: payloadVariant.body.params_sido_val,
              params_sgg_val: payloadVariant.body.params_sgg_val,
              ctpvCd: payloadVariant.body.ctpvCd,
              districtNo: payloadVariant.body.districtNo,
              sidoCount: Array.isArray(payloadVariant.body.params_sido_data) ? payloadVariant.body.params_sido_data.length : 0,
              sggCount: Array.isArray(payloadVariant.body.params_sgg_data) ? payloadVariant.body.params_sgg_data.length : 0,
            } : null,
            lastFailure,
          })
        );
      }
    }
  }

  return lastFailure;
}
