# 입차지 데이터 추가 가이드

## 1. 데이터베이스 스키마 업데이트

먼저 Supabase 데이터베이스의 `subsubroutes` 테이블에 다음 컬럼을 추가해야 합니다:

```sql
ALTER TABLE subsubroutes 
ADD COLUMN delivery_location_name text,
ADD COLUMN delivery_location_address text,
ADD COLUMN delivery_location_lat float8,
ADD COLUMN delivery_location_lng float8;
```

## 2. 데이터 입력 형식

### 방법 1: UI를 통한 입력 (권장)

1. **coupangRouteMap.html** 열기
2. 캠프 이름과 라우트 코드 입력 후 **불러오기**
3. 지도에서 해당 라우트를 클릭하여 선택
4. 좌측 패널의 **"입차지 정보"** 섹션에서:
   - **입차지 이름**: 예) `본캠프`, `식사동MB`, `중산캠프`
   - **입차지 주소**: 예) `경기 김포시 양촌읍 대포산단로 73`
   - **주소→좌표** 버튼 클릭하여 위도/경도 자동 입력
   - **입차지 저장** 버튼 클릭

### 방법 2: API를 통한 직접 입력

```bash
curl -X POST https://route.maroowell.com/route \
  -H "Content-Type: application/json" \
  -d '{
    "camp": "김포1",
    "code": "101",
    "delivery_location_name": "본캠프",
    "delivery_location_address": "경기 김포시 양촌읍 대포산단로 73",
    "delivery_location_lat": 37.5946,
    "delivery_location_lng": 126.7251
  }'
```

### 방법 3: SQL을 통한 직접 입력

```sql
-- 기존 라우트에 입차지 정보 추가
UPDATE subsubroutes 
SET 
  delivery_location_name = '본캠프',
  delivery_location_address = '경기 김포시 양촌읍 대포산단로 73',
  delivery_location_lat = 37.5946,
  delivery_location_lng = 126.7251
WHERE camp = '김포1' AND full_code = '101';

-- 또는 여러 서브라우트에 동일한 입차지 적용
UPDATE subsubroutes 
SET 
  delivery_location_name = '식사동MB',
  delivery_location_address = '경기 고양시 일산동구 고양대로1080번길 24',
  delivery_location_lat = 37.6634,
  delivery_location_lng = 126.7706
WHERE camp = '김포1' AND full_code LIKE '101A%';
```

## 3. 데이터 예시

### 김포1 캠프

| 서브라우트 | 입차지 이름 | 주소 | 위도 | 경도 |
|---------|---------|------|------|------|
| 101 | 본캠프 | 경기 김포시 양촌읍 대포산단로 73 | 37.5946 | 126.7251 |
| 101A | 식사동MB | 경기 고양시 일산동구 고양대로1080번길 24 | 37.6634 | 126.7706 |
| 101B | 본캠프 | 경기 김포시 양촌읍 대포산단로 73 | 37.5946 | 126.7251 |

### JSON 배치 입력 예시

여러 라우트의 입차지를 한 번에 입력하려면:

```json
[
  {
    "camp": "김포1",
    "code": "101",
    "delivery_location_name": "본캠프",
    "delivery_location_address": "경기 김포시 양촌읍 대포산단로 73",
    "delivery_location_lat": 37.5946,
    "delivery_location_lng": 126.7251
  },
  {
    "camp": "김포1",
    "code": "101A",
    "delivery_location_name": "식사동MB",
    "delivery_location_address": "경기 고양시 일산동구 고양대로1080번길 24",
    "delivery_location_lat": 37.6634,
    "delivery_location_lng": 126.7706
  },
  {
    "camp": "김포1",
    "code": "102",
    "delivery_location_name": "본캠프",
    "delivery_location_address": "경기 김포시 양촌읍 대포산단로 73",
    "delivery_location_lat": 37.5946,
    "delivery_location_lng": 126.7251
  }
]
```

## 4. 카카오내비 연동

입차지 정보를 입력한 후, UI에서 **"카카오내비"** 버튼을 클릭하면:
- **모바일**: 카카오내비 앱이 실행되어 해당 위치로 경로 안내
- **PC**: 카카오맵 웹페이지가 열려 해당 위치 표시

URL 스킴:
- 앱: `kakaomap://route?ep={경도},{위도}&by=CAR`
- 웹: `https://map.kakao.com/link/to/{이름},{위도},{경도}`

## 5. 좌표 찾는 방법

### 방법 1: UI 사용 (가장 쉬움)
1. 입차지 주소를 입력
2. "주소→좌표" 버튼 클릭
3. 자동으로 위도/경도가 입력됨

### 방법 2: 카카오맵에서 직접 확인
1. https://map.kakao.com/ 접속
2. 주소 검색
3. 해당 위치 우클릭 → "여기가 어디야?"
4. URL에서 좌표 확인: `?map_type=TYPE_MAP&itemId={ID}&urlLevel=3&urlX={경도}&urlY={위도}`

### 방법 3: Geocoding API 사용
```javascript
const geocoder = new kakao.maps.services.Geocoder();
geocoder.addressSearch('경기 김포시 양촌읍 대포산단로 73', (result, status) => {
  if (status === kakao.maps.services.Status.OK) {
    console.log('위도:', result[0].y);
    console.log('경도:', result[0].x);
  }
});
```

## 6. 데이터 확인

입력한 데이터를 확인하려면:

### UI에서 확인
1. coupangRouteMap.html 열기
2. 캠프/코드 입력 후 "불러오기"
3. 라우트 선택 시 좌측 패널에 입차지 정보 표시

### API로 확인
```bash
curl "https://route.maroowell.com/route?camp=김포1&code=101"
```

응답 예시:
```json
{
  "rows": [
    {
      "id": 123,
      "camp": "김포1",
      "full_code": "101",
      "delivery_location_name": "본캠프",
      "delivery_location_address": "경기 김포시 양촌읍 대포산단로 73",
      "delivery_location_lat": 37.5946,
      "delivery_location_lng": 126.7251,
      "vendor_name": "홍길동",
      "vendor_business_number": "123-45-67890"
    }
  ]
}
```

## 7. 주의사항

1. **위도/경도 정확도**: 소수점 6자리까지 입력 (약 0.1m 정확도)
2. **동일 캠프의 여러 서브라우트**: 같은 입차지를 사용하는 경우 같은 값을 입력
3. **입차지 없는 서브라우트**: 입력하지 않으면 `null`로 저장되며, 네비 기능은 비활성화됨
4. **주소 변경**: 입차지 주소가 변경되면 "주소→좌표" 버튼을 다시 눌러 좌표 업데이트 필요

## 8. 캠프 테이블 (camps) 활용

`camps` 테이블은 캠프의 기본 정보를 저장합니다:
- `camp`: 캠프 이름 (예: "김포1")
- `address`: 캠프 주소
- `latitude`, `longitude`: 캠프 위치 (기본 입차지로 활용 가능)

서브라우트별로 입차지가 다른 경우, `subsubroutes` 테이블의 `delivery_location_*` 필드를 우선 사용하고,
없으면 `camps` 테이블의 좌표를 fallback으로 사용할 수 있습니다.

## 9. 배치 입력 스크립트 예시

여러 라우트를 한 번에 입력하는 Node.js 스크립트:

```javascript
const data = [
  { camp: "김포1", code: "101", name: "본캠프", address: "경기 김포시 양촌읍 대포산단로 73", lat: 37.5946, lng: 126.7251 },
  { camp: "김포1", code: "101A", name: "식사동MB", address: "경기 고양시 일산동구 고양대로1080번길 24", lat: 37.6634, lng: 126.7706 },
  // ... 더 추가
];

for (const item of data) {
  await fetch('https://route.maroowell.com/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      camp: item.camp,
      code: item.code,
      delivery_location_name: item.name,
      delivery_location_address: item.address,
      delivery_location_lat: item.lat,
      delivery_location_lng: item.lng
    })
  });
  console.log(`✓ ${item.camp} ${item.code}`);
}
```

---

**질문이나 문제가 있으면 개발팀에 문의하세요.**
