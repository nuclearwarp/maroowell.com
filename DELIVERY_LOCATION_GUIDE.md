# 입차지 데이터 추가 가이드

## 1. 데이터베이스 스키마 업데이트

먼저 Supabase 데이터베이스의 `subsubroutes` 테이블에 다음 컬럼을 추가해야 합니다:

```sql
ALTER TABLE subsubroutes 
ADD COLUMN delivery_location_name text,
ADD COLUMN delivery_location_address text;
```

> **참고**: 좌표 필드(`delivery_location_lat`, `delivery_location_lng`)는 선택사항이며, 주소만으로도 카카오맵/내비가 작동합니다.

## 2. 데이터 입력 형식

### 방법 1: UI를 통한 입력 (권장)

1. **coupangRouteMap.html** 열기
2. 캠프 이름과 라우트 코드 입력 후 **불러오기**
3. 지도에서 해당 라우트를 클릭하여 선택
4. 좌측 패널의 **"입차지 정보"** 섹션에서:
   - **입차지 이름**: 예) `본캠프`, `식사동MB`, `중산캠프`
   - **입차지 주소**: 예) `경기 김포시 양촌읍 대포산단로 73`
   - **입차지 저장** 버튼 클릭

### 방법 2: API를 통한 직접 입력

```bash
curl -X POST https://route.maroowell.com/route \
  -H "Content-Type: application/json" \
  -d '{
    "camp": "김포1",
    "code": "101",
    "delivery_location_name": "본캠프",
    "delivery_location_address": "경기 김포시 양촌읍 대포산단로 73"
  }'
```

### 방법 3: SQL을 통한 직접 입력

```sql
-- 기존 라우트에 입차지 정보 추가
UPDATE subsubroutes 
SET 
  delivery_location_name = '본캠프',
  delivery_location_address = '경기 김포시 양촌읍 대포산단로 73'
WHERE camp = '김포1' AND full_code = '101';

-- 또는 여러 서브라우트에 동일한 입차지 적용
UPDATE subsubroutes 
SET 
  delivery_location_name = '식사동MB',
  delivery_location_address = '경기 고양시 일산동구 고양대로1080번길 24'
WHERE camp = '김포1' AND full_code LIKE '101A%';
```

## 3. 데이터 예시

### 김포1 캠프

| 서브라우트 | 입차지 이름 | 주소 |
|---------|---------|------|
| 101 | 본캠프 | 경기 김포시 양촌읍 대포산단로 73 |
| 101A | 식사동MB | 경기 고양시 일산동구 고양대로1080번길 24 |
| 101B | 본캠프 | 경기 김포시 양촌읍 대포산단로 73 |

### JSON 배치 입력 예시

여러 라우트의 입차지를 한 번에 입력하려면:

```json
[
  {
    "camp": "김포1",
    "code": "101",
    "delivery_location_name": "본캠프",
    "delivery_location_address": "경기 김포시 양촌읍 대포산단로 73"
  },
  {
    "camp": "김포1",
    "code": "101A",
    "delivery_location_name": "식사동MB",
    "delivery_location_address": "경기 고양시 일산동구 고양대로1080번길 24"
  },
  {
    "camp": "김포1",
    "code": "102",
    "delivery_location_name": "본캠프",
    "delivery_location_address": "경기 김포시 양촌읍 대포산단로 73"
  }
]
```

## 4. 카카오내비 연동 (자동 경로 안내)

입차지 정보를 입력한 후, UI에서 **"카카오내비"** 버튼을 클릭하면:
- **출발지**: 입차지 주소 (자동으로 좌표 변환)
- **도착지**: 라우트 중앙점 (폴리곤 중심점)
- **경로 안내**: 자동으로 길찾기 시작

### 작동 방식
1. 입차지 주소를 카카오 Geocoder로 좌표 변환
2. 선택된 라우트의 폴리곤 중심점 계산
3. 출발지→도착지 경로로 카카오내비 실행

### URL 형식
- **모바일**: `kakaomap://route?sp={출발경도},{출발위도}&ep={도착경도},{도착위도}&by=CAR`
- **PC**: `https://map.kakao.com/link/to/{라우트명},{위도},{경도}`

> **장점**: 버튼 한 번으로 입차지에서 라우트까지 자동 경로 안내!

## 5. 주소 입력 팁

### 정확한 주소 입력
- **도로명 주소** 사용 권장: `경기 김포시 양촌읍 대포산단로 73`
- **지번 주소**도 가능: `경기 김포시 양촌읍 대포리 123-4`
- 건물명이 있으면 더 정확: `경기 김포시 양촌읍 대포산단로 73 (마루웰 물류센터)`

### 주소 찾는 방법
1. **네이버/다음 지도**에서 검색
2. **우편번호 검색**으로 확인
3. 건물명으로 검색 후 도로명 주소 복사

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
      "vendor_name": "홍길동",
      "vendor_business_number": "123-45-67890"
    }
  ]
}
```

## 7. 주의사항

1. **주소 정확성**: 도로명 주소를 정확하게 입력하면 카카오맵이 더 정확하게 찾습니다
2. **동일 캠프의 여러 서브라우트**: 같은 입차지를 사용하는 경우 같은 주소를 입력
3. **입차지 없는 서브라우트**: 입력하지 않으면 `null`로 저장되며, 네비 기능은 비활성화됨
4. **카카오맵 검색**: 주소가 애매한 경우 카카오맵이 여러 결과를 보여줍니다

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
  { camp: "김포1", code: "101", name: "본캠프", address: "경기 김포시 양촌읍 대포산단로 73" },
  { camp: "김포1", code: "101A", name: "식사동MB", address: "경기 고양시 일산동구 고양대로1080번길 24" },
  { camp: "김포1", code: "102", name: "본캠프", address: "경기 김포시 양촌읍 대포산단로 73" },
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
      delivery_location_address: item.address
    })
  });
  console.log(`✓ ${item.camp} ${item.code}`);
}
```

---

**질문이나 문제가 있으면 개발팀에 문의하세요.**
