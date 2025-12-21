# Cloudflare Worker 배포 가이드

## 문제 해결

### 원인
- Supabase `subsubroutes` 테이블에 `color` 컬럼이 존재하지 않음
- Worker가 SELECT 쿼리에서 `color` 컬럼을 요청하여 500 에러 발생

### 해결
Worker 코드를 수정하여:
1. `color` 컬럼을 SELECT에서 제거
2. 프론트엔드와 동일한 로직으로 `color`를 자동 생성하여 응답에 포함

## 배포 방법

### 1. Cloudflare Dashboard에서 직접 배포

1. [Cloudflare Dashboard](https://dash.cloudflare.com) 로그인
2. Workers & Pages 섹션으로 이동
3. 기존 Worker 선택 (또는 새로 생성)
4. "Quick Edit" 클릭
5. `worker.js` 파일 내용을 전체 복사하여 붙여넣기
6. "Save and Deploy" 클릭

### 2. Wrangler CLI로 배포 (권장)

```bash
# Wrangler 설치
npm install -g wrangler

# 로그인
wrangler login

# 배포
wrangler deploy worker.js --name route-api --compatibility-date 2024-01-01
```

### 3. 환경 변수 설정

Worker에 다음 환경 변수를 설정해야 합니다:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Cloudflare Dashboard에서:
1. Worker 선택
2. Settings > Variables
3. Environment Variables 추가

## 변경 사항

### 제거된 기능
- `color` 컬럼 SELECT (DB에 없음)
- `color` 컬럼 PATCH/INSERT

### 추가된 기능
- `generateColor()` 함수: 프론트엔드와 동일한 색상 생성 로직
- GET/POST/DELETE 응답에 자동으로 `color` 필드 추가

## 테스트

배포 후 다음 명령으로 테스트:

```bash
# Health check
curl https://route.maroowell.com/health

# GET route
curl "https://route.maroowell.com/route?camp=일산2&mode=prefix&code=101"
```

## (선택) Supabase에 color 컬럼 추가

향후 `color`를 DB에 영구 저장하려면:

```sql
ALTER TABLE subsubroutes ADD COLUMN IF NOT EXISTS color TEXT;
```

이후 Worker 코드에서 `color`를 다시 SELECT/INSERT에 포함시킬 수 있습니다.
