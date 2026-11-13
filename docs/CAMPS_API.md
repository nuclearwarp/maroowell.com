# Maroowell Camps Data API v1

운영 코드 `worker.js`의 `handleExternalApi` / `handleCampsGet` / `handleCampsPost` / `handleCampsBatch` 기준. 2026-11-13 확인.

## 1. 기본정보와 인증

- Base URL: `https://route.maroowell.com`
- 직접 연결: `https://purple-river-0717.brain-0f6.workers.dev`
- API prefix: `/api/v1`, JSON UTF-8, HTTPS
- 인증 헤더: `X-API-Key: <KEY>` 또는 `Authorization: Bearer <KEY>`
- **키를 URL/브라우저 번들/GitHub에 넣지 마세요.** Supabase의 `service_role` 또는 `sb_secret_` 키를 사용하지 않습니다.

### HR 전용 권한

| Scope | 허용 |
| --- | --- |
| `camps.read` | 캠프 목록·검색 |
| `camps.write` | 등록·수정·배치 생성/수정 |
| `camps.delete` | 단건·배치 삭제 |

HR 키의 모든 권한은 **Camps 데이터 API 안에서만** 적용됩니다. `vendors.*`, `subsubroutes.*`, 정산 등 다른 API 접근 권한은 없습니다. 원문 키는 배포/DB에 저장하지 않고 SHA-256 해시를 저장합니다. API 사용 이력은 `api_audit_log`에서 추적합니다.

## 2. 엔드포인트

| Method | Path | 필요한 Scope | 설명 |
| --- | --- | --- | --- |
| GET | `/api/v1/camps` | `camps.read` | 검색·목록 |
| POST | `/api/v1/camps` | `camps.write` | 추가 또는 기존 캠프 갱신 |
| PATCH | `/api/v1/camps/{id}` | `camps.write` | ID 기준 부분 수정 |
| DELETE | `/api/v1/camps/{id}` | `camps.delete` | ID 기준 삭제 |
| POST | `/api/v1/camps/batch` | `camps.write` (+ 삭제 시 `camps.delete`) | 일괄 생성·수정·삭제 |

현재 버전은 **`GET /api/v1/camps/{id}`를 지원하지 않습니다.** 단건 조회는 목록 검색 후 응답에서 찾아야 합니다.

### GET /api/v1/camps

| 쿼리 | 타입 | 설명 |
| --- | --- | --- |
| `q` | string | `camp` / `mb_camp` 이름으로 검색 |
| `camp` | string | 캠프명 정확히 일치 |
| `mb_camp` | string | MB/세부 캠프명 정확히 일치. 이전 별칭 `orbm_camp`, `ormb_camp`도 허용 |
| `limit` | integer | 기본 500, 최대 1000 |

`q`가 없는 기본 조회는 `updated_at DESC, created_at DESC, id DESC` 정렬입니다. `q` 검색은 일치도 기준 중복 제거/정렬을 수행합니다. Offset/커서 페이지네이션은 아직 없습니다.

```bash
curl -sS -H "X-API-Key: $HR_CAMPS_API_KEY" \
 "https://route.maroowell.com/api/v1/camps?q=%EC%9D%BC%EC%82%B0&limit=100"
```

예시 응답(실제 DB 값 아님):

```json
{
  "rows": [{
    "id": 126,
    "camp": "일산2",
    "mb_camp": "본캠프",
    "code": "126",
    "camp_type": "본캠프",
    "address": "예시 주소",
    "region": "고양",
    "area": null,
    "latitude": 37.0,
    "longitude": 127.0,
    "parent_camp_id": null,
    "receiving_sh_id": null,
    "numbering_url": null,
    "description": null
  }]
}
```

`rows`는 실제 DB의 `created_at`, `updated_at` 등 컬럼을 추가로 포함할 수 있습니다.

### POST /api/v1/camps

필수: `camp`, `mb_camp`(또는 `delivery_location_name` / `name`), `address`.

선택 입력: `code`, `numbering_url`, `latitude`, `longitude`. 기존 `(camp, mb_camp)` 조합이 있으면 업데이트하고, 없으면 삽입합니다. **다른 필드는 PATCH 또는 batch로 설정해야 합니다.**

```bash
curl -X POST "https://route.maroowell.com/api/v1/camps" \
 -H "X-API-Key: $HR_CAMPS_API_KEY" -H "Content-Type: application/json" \
 --data '{"camp":"TEST 캠프","mb_camp":"본캠프","address":"예시 주소","code":"TEST901"}'
```

응답: `{"row":{...}}`, HTTP 200. 이름 조합 중복으로 예상치 못한 갱신이 일어나지 않도록 사전 조회하세요.

### PATCH /api/v1/camps/{id}

```bash
curl -X PATCH "https://route.maroowell.com/api/v1/camps/126" \
 -H "X-API-Key: $HR_CAMPS_API_KEY" -H "Content-Type: application/json" \
 --data '{"region":"고양","description":"HR 연동"}'
```

업데이트 허용 필드: `camp_type`, `camp`, `mb_camp`, `parent_camp_id`, `receiving_sh_id`, `address`, `region`, `area`, `code`, `numbering_url`, `latitude`, `longitude`, `description`.

응답: `{"row":{...}}` (200). 없는 ID는 404, 수정 가능한 필드가 없으면 400.

### DELETE /api/v1/camps/{id}

```bash
curl -X DELETE "https://route.maroowell.com/api/v1/camps/126" \
 -H "X-API-Key: $HR_CAMPS_API_KEY"
```

응답: `{"row":{...},"deleted":true}` (200). 없는 ID는 404.

**삭제는 즉시 반영됩니다.** `camps.parent_camp_id`와 `camps.receiving_sh_id`의 FK는 `ON DELETE SET NULL`이므로 참조 자식의 연결이 해제될 수 있습니다. 다른 FK/DB 제한으로 삭제가 실패할 수도 있습니다.

### POST /api/v1/camps/batch

```json
{
  "inserts": [{
    "camp": "TEST 캠프",
    "mb_camp": "본캠프",
    "address": "예시 주소",
    "camp_type": "본캠프",
    "code": "TEST901"
  }],
  "updates": [{
    "id": 126,
    "payload": {"description": "설명 변경", "area": "고양"}
  }],
  "deletes": [200]
}
```

응답: `{"ok":true,"inserted":1,"updated":1,"deleted":1,"numberingUrlSupported":true}`.

실제 처리 순서: **삭제 → 코드 슬롯 임시 비우기 → 수정 → 삽입**. `code` 변경이 있는 배치에서 코드 충돌을 줄이기 위해서입니다. **DB 트랜잭션으로 묶여 있지 않습니다.** 처리 도중 실패하면 일부 요청이 이미 반영될 수 있으니 대량 변경 전에 목록을 백업하세요.

## 3. Camps 컬럼

| 컬럼 | 데이터 타입 | 비고 |
| --- | --- | --- |
| `id` | bigint | 기본키 |
| `camp` | text | 캠프 이름(필수) |
| `mb_camp` | text | 세부/MB 캠프 이름 |
| `camp_type` | text | 캠프 유형 |
| `code` | text | UNIQUE 제약, null 허용 |
| `address` | text | 주소 |
| `region`, `area` | text | 지역 및 Area |
| `parent_camp_id`, `receiving_sh_id` | bigint | `camps.id` FK, 본인 참조 금지 |
| `latitude`, `longitude` | double precision | 좌표 |
| `numbering_url`, `description` | text | 채번 URL, 설명 |
| `created_at`, `updated_at` | timestamptz | 기록 시간 |

문자열 필드의 빈 문자열은 대부분 null로 정규화됩니다. `code`는 DB에서 UNIQUE입니다.

## 4. 응답 코드 및 운영

| HTTP | 상황 |
| --- | --- |
| 200 | 성공 |
| 400 | 필수 필드 누락/변경 필드 오류 |
| 401 | 키 누락, 무효, 만료 |
| 403 | scope 부족 |
| 404 | 미지원 경로, 존재하지 않는 ID |
| 405 | 허용하지 않는 메서드 |
| 500 | DB 제약 오류 또는 서버 내부 오류가 최상위 예외로 처리되는 경우 |

오류는 주로 `{"error":"message"}` 형태입니다. HTTP 상태코드 확인 후 재시도하세요. 현행 v1은 개별 요청 사용량 제한과 조회 offset 페이지네이션을 별도로 제공하지 않습니다.

- 인증 키 원문은 담당자의 비공개 환경에만 보관합니다. GitHub, 앱 번들, URL, 일반 로그에 저장 금지.
- 키 유출 시 `public.api_keys`의 HR 행에서 `is_active=false`로 폐기합니다. 기존 키는 복구 불가하고 새로 발급해야 합니다.
- 사용 기록: `public.api_audit_log` (`client_code`, `action`, `status`, `path`, `created_at`).
- Supabase secret/service_role 키는 HR 파트너에게 제공하지 않습니다.
