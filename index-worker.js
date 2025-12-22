/**
 * Cloudflare Worker - 우편번호 경계 API
 * 
 * 주소정보 플랫폼 개편에 따른 새로운 API 사용
 * https://www.juso.go.kr/api/totalMap/selectKarbSbdList
 */

export default {
  async fetch(request, env, ctx) {
    // CORS 헤더를 포함한 JSON 응답
    function jsonResp(obj, status = 200) {
      return new Response(JSON.stringify(obj), {
        status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    try {
      const url = new URL(request.url);
      const zipcode = url.searchParams.get("zipcode");

      if (!zipcode) {
        return jsonResp({ error: "zipcode 쿼리 파라미터가 필요함" }, 400);
      }

      // ---------------------------------------------------
      // 주소정보 플랫폼 새 API 호출
      // ---------------------------------------------------
      const apiUrl = "https://www.juso.go.kr/api/totalMap/selectKarbSbdList";
      
      // POST 요청으로 우편번호 전달
      const formData = new URLSearchParams();
      formData.append("sbdno", zipcode);

      const apiRes = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://maroowell.com/",
          "Origin": "https://maroowell.com",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: formData.toString(),
      });

      if (!apiRes.ok) {
        return jsonResp(
          {
            error: "주소정보 API 호출 실패",
            status: apiRes.status,
          },
          502
        );
      }

      const data = await apiRes.json();

      // ---------------------------------------------------
      // 응답 데이터 검증 및 파싱
      // ---------------------------------------------------
      if (!data.results || !data.results.content || !Array.isArray(data.results.content)) {
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
      
      if (!item.geom) {
        return jsonResp(
          {
            error: "geom 필드가 없음",
            item,
          },
          500
        );
      }

      // ---------------------------------------------------
      // GeoJSON 파싱
      // ---------------------------------------------------
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

      // MultiPolygon 좌표 추출
      if (geojson.type !== "MultiPolygon" || !Array.isArray(geojson.coordinates)) {
        return jsonResp(
          {
            error: "예상치 못한 geometry 타입",
            type: geojson.type,
          },
          500
        );
      }

      // coordinates: [ [ [ [x,y], [x,y], ... ] ] ]
      // EPSG:5179 좌표계로 추정됨
      const polygon5179 = geojson.coordinates;

      // 중심점 계산 (첫 번째 폴리곤의 평균)
      let center5179 = null;
      if (polygon5179.length > 0 && polygon5179[0].length > 0 && polygon5179[0][0].length > 0) {
        const firstRing = polygon5179[0][0];
        let sumX = 0, sumY = 0, count = 0;
        
        for (const [x, y] of firstRing) {
          if (typeof x === "number" && typeof y === "number" && isFinite(x) && isFinite(y)) {
            sumX += x;
            sumY += y;
            count++;
          }
        }
        
        if (count > 0) {
          center5179 = [sumX / count, sumY / count];
        }
      }

      // ---------------------------------------------------
      // 응답 반환 (index.html과 호환되는 형식)
      // ---------------------------------------------------
      const result = {
        zipcode,
        srid: 5179,
        center5179,
        polygon5179,
        metadata: {
          ctprvNm: item.ctprvNm,    // 시도명
          sgnNm: item.sgnNm,          // 시군구명
          sbdno: item.sbdno,          // 우편번호
          lawneucod: item.lawneucod,  // 법정동코드
        }
      };

      return jsonResp(result);
    } catch (err) {
      return jsonResp(
        {
          error: "Worker 내부 예외 발생",
          detail: String(err),
          stack: err.stack,
        },
        500
      );
    }
  },
};
