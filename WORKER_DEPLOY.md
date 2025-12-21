# Cloudflare Worker 배포 가이드

## 최신 변경사항 (2024-12-21)

### 문제: 126 검색 시 126C만 표시되는 이슈
**원인**: Supabase의 `like` 연산자가 URL 인코딩 문제로 제대로 작동하지 않음

**해결**: 
- Supabase에서 camp의 모든 데이터를 가져온 후
- Worker에서 JavaScript `startsWith()`로 필터링
- 이제 "126" 검색 시 126, 126A, 126B, 126C, 126D 등 모두 반환됨

### 이전 해결 사항
- Supabase `subsubroutes` 테이블에 `color` 컬럼이 존재하지 않는 문제 해결
- Worker가 SELECT 쿼리에서 `color` 컬럼을 요청하여 500 에러 발생 → 자동 생성으로 변경

## 배포 방법

### 방법 1: Cloudflare Dashboard에서 직접 배포 (간단)

1. [Cloudflare Dashboard](https://dash.cloudflare.com) 로그인
2. **Workers & Pages** 섹션으로 이동
3. 기존 Worker 선택 (route-api 또는 해당 Worker 이름)
4. **"Quick Edit"** 또는 **"Edit Code"** 클릭
5. `worker.js` 파일 내용을 **전체 선택 후 복사**하여 붙여넣기
6. **"Save and Deploy"** 클릭
7. 배포 완료까지 약 10-30초 대기

### 방법 2: Wrangler CLI로 배포 (권장)

```bash
# Wrangler 설치 (한 번만)
npm install -g wrangler

# 로그인 (한 번만)
wrangler login

# 배포
wrangler deploy worker.js --name route-api --compatibility-date 2024-01-01
```

### 환경 변수 확인

Worker에 다음 환경 변수가 설정되어 있어야 합니다:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**설정 방법** (Cloudflare Dashboard):
1. Worker 선택
2. **Settings** > **Variables**
3. **Environment Variables** 섹션에서 확인/추가

## 배포 후 테스트

```bash
# 1. Health check
curl https://route.maroowell.com/health

# 2. 일산2 캠프의 126으로 시작하는 모든 라우트 조회 (수정된 부분)
curl "https://route.maroowell.com/route?camp=일산2&code=126&mode=prefix"

# 기대 결과: 126, 126A, 126B, 126C, 126D 등 모든 라우트 반환
# {"rows":[...]} 형식으로 여러 row 반환되어야 함

# 3. 특정 라우트만 조회
curl "https://route.maroowell.com/route?camp=일산2&code=126C&mode=exact"
```

## 변경 사항 상세

### `worker.js` - handleRouteGet() 함수

**Before:**
```javascript
// Supabase like 연산자 사용
if (mode === "prefix") {
  params.set("full_code", `like.${code}%`);
}
```

**After:**
```javascript
// 1. camp의 모든 데이터를 가져옴
const rows = await supabaseFetch(env, ...);

// 2. JavaScript로 필터링
if (mode === "prefix") {
  filteredRows = filteredRows.filter(row => 
    row.full_code && row.full_code.startsWith(code)
  );
}
```

### 프론트엔드 개선 (`coupangRouteMap.html`)

1. **로그 개선**: API 요청 URL과 응답 개수 표시
2. **통계 개선**: polygon 있는/없는 라우트 개수 구분 표시
3. **라우트 목록 UI**: 모든 로드된 라우트를 리스트로 표시
   - ✓ : polygon 데이터 있음 (지도에 표시됨)
   - ○ : polygon 데이터 없음 (새로 그리기 필요)

## 문제 해결

### 여전히 126C만 나오는 경우

1. **Worker가 배포되었는지 확인**
   ```bash
   curl "https://route.maroowell.com/route?camp=일산2&code=126&mode=prefix" | jq '.rows | length'
   ```
   결과가 1보다 커야 함 (예: 5, 6 등)

2. **브라우저 캐시 삭제**
   - Ctrl+Shift+R (Windows/Linux)
   - Cmd+Shift+R (Mac)

3. **Worker 로그 확인** (Cloudflare Dashboard)
   - Worker 선택 > Logs > Begin log stream
   - 브라우저에서 검색 실행
   - 로그에서 에러 확인

### Supabase 연결 오류

```bash
# Supabase URL 확인
echo $SUPABASE_URL

# Service Role Key 확인 (처음 몇 글자만)
echo $SUPABASE_SERVICE_ROLE_KEY | head -c 20
```

## (선택) 성능 최적화

현재는 camp의 모든 데이터를 가져온 후 필터링합니다.
데이터가 많을 경우 (수천 개 이상):

```sql
-- Supabase에서 prefix 검색을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_subsubroutes_camp_code 
ON subsubroutes(camp, full_code text_pattern_ops);
```

그리고 Worker에서 `ilike` 사용:
```javascript
// 대소문자 구분 없는 like
params.set("full_code", `ilike.${code}*`);
```

## 지원

문제가 계속되면:
1. Worker 로그 확인
2. 브라우저 개발자 도구 > Network 탭에서 API 응답 확인
3. `coupangRouteMap.html`의 왼쪽 하단 로그 패널 확인
