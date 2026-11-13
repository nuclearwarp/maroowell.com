# 마루웰 캠프 QR · 채번 설문 패턴 인식 가이드

기준 소스: 마루웰 웹 `public/coupang_camp`, Android `NumberingActivity.kt`, iOS `NumberingView.swift`, Supabase `mw_my_numbering_context_v2` (2026-11-13 확인).
API 범위와 인증은 [CAMPS_API.md](./CAMPS_API.md) 참조.

## 1. 캠프 코드 기반 QR 생성

**QR 페이로드는 URL이나 JSON이 아니라 `camps.code` 텍스트 자체입니다.**

1. camps 목록 또는 API에서 대상 행을 조회합니다. `GET /api/v1/camps?camp=...`.
2. 대상이 **서브/모바일 캠프**이고 본캠프가 지정되거나 추론되면, 본캠프의 `code`를 상속합니다. 반면 `SUB_HUB`이거나 본캠프 자체면 해당 행의 `code`를 그대로 사용합니다.
3. 코드가 비어 있으면 QR을 만들지 않습니다. 상속된 본캠프 코드가 없어도 마찬가지입니다.
4. 생성 파라미터는 `qrcode@1.5.4`의 `toCanvas(canvas, code, {width:300, margin:2, errorCorrectionLevel:"M"})`입니다.
5. QR 복사·다운로드에는 **QR + 캠프명 레이블**을 합성합니다. 출력 캔버스는 가로 416px, 세로 498px(360px QR, 사방 28px 여백, 아래 82px 레이블)입니다. QR 내부 데이터는 캠프 코드이며, 레이블은 스캔 페이로드에 포함되지 않습니다.

### 소스의 핵심 규칙

- `isSubHub(row)`: `camp_type`을 대문자·공백·하이픈 정규화한 값이 `SUB_HUB`인지 확인.
- `isBaseCampRow(row)`: `mb_camp`가 비어 있거나 `본캠프` 또는 `row.camp`와 같으면 본캠프로 판단 (SUB_HUB 제외).
- `resolveParent(row)` / `inheritedParent(row)`: 명시적 `parent_camp_id`를 우선하고, 본캠프 후보를 찾아 상속. 대상 본캠프가 없으면 자신의 코드 사용. **정확한 부모 추론은 웹의 `resolveParent` 함수를 참고**합니다.
- `qrSource(row)`: 상속 부모가 있으면 해당 부모, 없으면 현재 행을 QR 소스로 사용.
- 이미지 이름: `<캠프명>_QR.png`.

### 독립 구현 예시(JavaScript)

아래는 이미 **부모 캠프 행을 판별한 다음** QR을 생성하는 방법입니다. 부모 추론/DB 관계 확인 자체를 QR 함수 안에 임의 구현하지 마세요.

```javascript
import QRCode from "qrcode"; // production web uses qrcode@1.5.4
const source = parentCampRow ?? campRow;
const code = String(source.code ?? "").trim();
if (!code) throw new Error("QR용 캠프 코드가 없습니다.");
await QRCode.toCanvas(canvasElement, code, {
  width: 300, margin: 2, errorCorrectionLevel: "M"
});
```

## 2. 채번 데이터 흐름

**현행 구현은 Camps API만으로 채번 요청을 제출하는 형태가 아닙니다.** `camps.numbering_url`을 Google Forms 설문 URL로 참조하고, 앱은 사용자의 스케줄·라우트와 Form 질문 데이터를 합쳐 제출합니다.

```text
앱 로그인 사용자
  └─ RPC mw_my_numbering_context_v2(p_date=한국 날짜)
      ├─ profiles + maroowell_info (승인·기사 ID)
      ├─ maroowell_schedule + dragon_car (해당일 배차)
      ├─ subsubroutes.delivery_location_name (라우트 입차지)
      └─ camps.numbering_url (캠프 채번 URL)
           └─ Google Forms viewform 다운로드
               └─ FB_PUBLIC_LOAD_DATA_ 파싱
                   └─ 질문 제목 및 선택지 패턴 매핑
                       └─ 기사 ID·운송장·수량·모바일 캠프 채우기
                           └─ Google Forms formResponse 제출
                               └─ numbering_requests 이력 저장
```

`mw_my_numbering_context_v2`는 `p_date`의 배차에서 현재 승인된 사용자와 일치하는 레코드를 찾습니다. 휴무/라우트 없는 맥락은 앱에서 제외합니다.

### 2.1 라우트 → 입차지 매핑

**중요: 모바일캠프 명칭의 소스는 `subsubroutes.delivery_location_name`입니다.** 설문 선택지의 첫 번째 항목을 임의 선택하면 안 됩니다.

- 같은 캠프: `lower(trim(subsubroutes.camp)) = lower(trim(schedule.camp))`.
- `subsubroutes`는 `is_active=true`이고 `delivery_location_name`이 비어 있지 않아야 합니다.
- 서브라우트 코드: `full_code` 우선, 없으면 `code`. 양쪽 모두 대문자화 후 숫자/영문 이외 문자를 제거하여 배차 `route_label`과 비교합니다.
- 우선순위: **정확히 일치** → 배차 라우트가 서브라우트 코드로 시작 → 서브라우트 코드가 배차 라우트로 시작.
- 같은 우선순위에서 코드 길이 차이, 최신 `updated_at`, 가장 큰 `id` 순으로 한 행을 선택합니다.
- 채번 URL은 `camps`에서 캠프명을 대소문자·공백 무시 일치시키고 `numbering_url`이 비어 있지 않은 최신 행을 선택합니다.

즉 일산2 `126`으로 조회한 뒤 실제 입차지 `양평동4가MB` 같은 값이 `subsubroutes.delivery_location_name`에 있다면, 그 값을 설문 선택지 매칭 입력으로 사용합니다.

### 2.2 Google Forms URL 정규화

- 저장된 `numbering_url`의 `/formResponse`를 `/viewform`으로 바꿉니다.
- Google Forms URL의 URL query/fragment를 제외해 조회 URL을 정규화합니다.
- HTML 내부 `FB_PUBLIC_LOAD_DATA_ = ...; </script>` 패턴에서 데이터를 추출합니다.
- JSON 배열을 재귀 순회해 **질문 제목, 숫자형 entry ID, 선택지 목록**을 수집합니다.
- `formResponse` 제출 URL은 `viewform`의 경로를 변환합니다.

Google Forms 내부 포맷은 공식 안정 API 계약이 아니므로 변경 가능성이 있습니다. 파싱 실패 시 조용히 전송하지 말고 오류 표시 후 수동 제출로 전환해야 합니다.

### 2.3 제목 기반 질문 인식 규칙

제목을 대문자화하고 공백을 제거한 후 다음 단어 포함 여부로 질문을 찾습니다.

| 분류 | 제목 인식 조건 |
| --- | --- |
| 운송장 번호 | `운송장번호` 또는 `송장번호` |
| 채번 수량 | `수량` + (`채번` 또는 `송장`) |
| 기사 ID | `아이디` 또는 `기사ID` 또는 `COUPANGID` |
| 모바일캠프/입차지 | (`모바일` + `캠프`) 또는 `요청캠프` 또는 `입차캠프` |
| 분기 질문 | 선택지에 `채번요청`이 있고 다른 선택지에 `반품송장` 또는 `반품출력` |

- 채번 요청 분기 선택지: `채번 요청` (매칭되는 실제 선택지 텍스트 우선).
- 반품 출력 요청 분기 선택지: `반품 송장 출력` (실제 선택지 텍스트 우선).
- 채번 폼 기사 ID/모바일 캠프는 각 유형의 첫 번째 인식 항목을 사용합니다.
- 반품 폼은 ID/모바일 캠프 유형의 **두 번째 인식 항목을 우선 사용**, 없으면 첫 번째를 사용합니다.
- 폼 질문의 **entry ID는 설문마다 달라지므로 고정값으로 작성하지 않습니다.**

### 2.4 모바일캠프 선택지 유사도 점수

앱에서 `delivery_location_name`과 설문 선택지를 비교하는 방식:

1. 정규화 `fuzzyKey`: 대문자화 → 숫자·영문·한글 이외 제거 → `MOBILE`/`CAMP`/`CENTER`/`MB` 제거.
2. 코어 `fuzzyCore`: 위 결과에서 `본캠프→본`, `본센터→본`, `센터`/`동`/`가` 제거.
3. 각 선택지의 점수:
   - 전체 정규화 값 정확히 같음: **1000점**
   - 코어 값 정확히 같음: **900점**
   - 전체 정규화 문자열이 서로 포함 관계: **700 + 짧은 길이**
   - 코어 문자열이 서로 포함 관계(각각 길이 2 이상): **600 + 짧은 길이**
   - 코어 공통 접두어 길이 2 이상: **400 + 공통 접두어 길이**
   - 나머지: 0점
4. 최고 점수가 **400 이상**이면 해당 선택지를 자동 선택합니다. 아니면 **빈값을 보여주고 사용자가 직접 선택**해야 합니다.

**안전 규칙:** 단순히 선택지 1번을 자동 선택하지 않습니다. 오매칭 방지를 위해 확인되지 않은 라우트는 반드시 사용자 선택을 요구합니다.

### 2.5 입력값 검증 및 Google Forms 제출

- 채번 요청: 기사 ID, 요청 모바일캠프, 운송장 번호, 채번 수량(양의 정수) 필수.
- 반품 송장 출력 요청: 기사 ID, 요청 모바일캠프 필수.
- 운송장 입력은 원본 복사 문자열을 화면에 그대로 표시한 후 숫자 패턴을 추출합니다. Android/iOS의 별도 ClipboardPolicy는 `운송장/송장 번호` 레이블과 10~18자리, 독립된 10~18자리 숫자 등을 대상으로 자동 붙여넣기 적합성을 판단합니다. 최종 입력 처리 `extractWaybill`은 레이블 뒤 8자리 이상 또는 처음 나오는 8자리 이상 숫자를 선택합니다.
- 제출 POST: `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `entry.<질문ID>=<값>`, `fvv=1`, `pageHistory=<값>`.
- 다중 섹션 분기가 있으므로 첫 시도는 채번 `pageHistory=0,1`, 반품 `pageHistory=0,2`. **HTTP 400일 때만** 다른 pageHistory 값을 재시도합니다. 성공 응답을 재시도하면 이중 접수 위험이 있습니다.
- 성공 응답 이후 `numbering_requests`에 사용자·유형·캠프·모바일캠프·운송장·수량을 기록합니다. 제출 성공과 이력 저장은 별도 요청이므로 이력 저장 실패 시 설문이 이미 접수되었을 수 있습니다.

## 3. HR 연동에서의 사용 구분

| 기능 | HR이 Camps API 키로 가능한가? | 방법 |
| --- | --- | --- |
| 캠프 코드/채번 URL/주소 조회 | **가능** | `GET /api/v1/camps` |
| 캠프 코드·채번 URL 수정 | **가능** | `PATCH /api/v1/camps/{id}` |
| 캠프 코드 QR 생성 | **가능** | 응답의 `code`를 QR에 인코딩 (외부 QR 라이브러리는 HR에서 선택) |
| 본캠프 QR 상속 | **가능** | `parent_camp_id`로 부모 행을 조회, 본캠프 판단 적용 |
| 기사별 라우트·입차지 자동인식 | **Camps 키만으로는 불가능** | 인증된 사용자 RPC와 `subsubroutes.delivery_location_name`이 필요 |
| Google Forms 질문/선택지 인식 | **Camps 키만으로는 불가능** | `numbering_url`의 Google Forms HTML 조회·파싱 별도 수행 |
| 채번/반품 폼 제출 | **Camps 키만으로는 불가능** | Google Forms `formResponse` 요청, 사용자 동작/동의 필요 |
| 채번 요청 이력 DB 기록 | **Camps 키만으로는 불가능** | `numbering_requests` 접근 권한 별도 필요 |

**권고:** QR 생성은 HR 서버 자체 기능으로 쉽게 이식할 수 있지만, 채번 자동 제출까지 연동하려면 전용 API와 서버 측 접근 제어·양식 변경 대응이 따로 필요합니다. 현행 HR 캠프 키가 Supabase 사용자 권한이나 채번 제출 권한을 부여하지는 않습니다.
