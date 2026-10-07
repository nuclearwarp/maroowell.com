# Vendors API

Base URL: `https://route.maroowell.com`

## Web/admin API

마루웰 로그인 세션의 Supabase access token을 `Authorization: Bearer <JWT>`로 전달합니다.

- `GET /vendors?q=<검색어>&limit=<1..1000>`
  - 상호명, 별칭, 사업자번호, vendor_code 검색
- `POST /vendors`
  - 벤더 추가
  - 최소 권한: 마루웰 role_level 60 이상
- `GET /vendors/{vendor_id}`
  - 단건 상세 + 삭제 가능 여부 + 참조 데이터 종류
- `PATCH /vendors/{vendor_id}`
  - 벤더 수정
  - 최소 권한: admin 또는 role_level 90 이상
- `DELETE /vendors/{vendor_id}`
  - 벤더 삭제
  - 최소 권한: admin 또는 role_level 90 이상
  - 연결된 FK 데이터가 있으면 HTTP 409로 삭제 차단

### 요청 필드

```json
{
  "name": "마루웰",
  "nickname": "마루웰",
  "business_number": "259-15-01828",
  "vendor_code": "bn_2591501828"
}
```

`vendor_code`를 비우면 사업자번호 기준 `bn_<10자리>` 형태로 자동 생성합니다.

## External API v1

API Key는 `X-API-Key: <key>` 또는 `Authorization: Bearer <key>`로 전달합니다.

- `GET /api/v1/vendors` — scope: `vendors.read`
- `GET /api/v1/vendors/{vendor_id}` — scope: `vendors.read`
- `POST /api/v1/vendors` — scope: `vendors.write`
- `PATCH /api/v1/vendors/{vendor_id}` — scope: `vendors.write`
- `DELETE /api/v1/vendors/{vendor_id}` — scope: `vendors.delete`

모든 External API 호출은 `api_audit_log`에 API key, action, path, resource_id, status 기준으로 기록됩니다.

## Examples

```bash
curl -H "X-API-Key: $MAROOWELL_API_KEY" \
  "https://route.maroowell.com/api/v1/vendors?q=마루웰&limit=20"
```

```bash
curl -X PATCH \
  -H "X-API-Key: $MAROOWELL_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"nickname":"MW"}' \
  "https://route.maroowell.com/api/v1/vendors/<vendor-uuid>"
```

```bash
curl -X DELETE \
  -H "X-API-Key: $MAROOWELL_API_KEY" \
  "https://route.maroowell.com/api/v1/vendors/<vendor-uuid>"
```
