# 쿠팡 파트너스 정적 사이트 플레이북

숨숨마을(B-Cat-Cpang)을 기준으로, **같은 구조·같은 플랫폼**에 주제만 바꿔 새 사이트를 다시 만드는 방법이다.  
이 문서는 “왜 이렇게 만들었는지”와 “어디를 바꾸면 되는지”를 한곳에 둔다.

작업 한 줄 요약: **구글 시트에 파트너스 링크를 넣으면, 로컬 스크립트가 상품명·사진을 모아 GitHub에 올리고, Vercel이 정적 HTML을 서비스한다. 지식 글은 같은 도메인의 위키, 나머지 긴 글은 블로그.**

---

## 1. 이 조합을 고른 이유

| 선택 | 이유 |
|---|---|
| 정적 HTML + JSON | 서버/DB 없이 GitHub + Vercel로 끝난다. |
| 구글 시트 = 상품 원장 | 비개발자도 링크만 넣으면 된다. |
| 사진은 레포에 jpg로 저장 | 쿠팡 CDN 핫링크는 막히거나 사라진다. |
| 수집은 로컬 PC만 | GitHub Actions IP는 쿠팡/네이버에서 막히는 경우가 많다. |
| 위키는 정적 페이지 | Next.js 위키 앱을 합치지 않는다. 쇼핑몰과 디자인·배포를 하나로 유지한다. |
| 지식 글 일부만 사이트 | 사이트는 구매와 바로 연결되는 글, 나머지는 블로그. |

다시 만들 때도 **이 조합을 유지**하는 것이 핵심이다. 플랫폼을 바꾸면 이 플레이북의 가치가 떨어진다.

---

## 2. 전체 구조

```text
[구글 시트 광고용]
  행번호 | 쿠팡 파트너스 단축링크 | (선택) 카테고리·상품명
        │
        │  공개 CSV
        ▼
[로컬 PC]  npm run sync
  1) 단축링크 → 쿠팡 상품번호
  2) 네이버 검색 "{상품번호} 쿠팡"  (쿠팡 상품 페이지는 차단됨)
  3) 제목 + thumbnail.coupangcdn.com 이미지 URL
  4) jpg를 images/products/product-001.jpg 로 저장
  5) data/products.json, data/sheet-flags.json 갱신
  6) Apps Script로 시트 행을 빨강 표시 (이미지 없음/중복)
        │
        │  git push
        ▼
[GitHub main]  ← Vercel이 이 레포를 그대로 배포
  index.html     쇼핑몰
  wiki/          위키
  data/          상품 JSON
  images/        로컬 사진
        │
        ▼
[방문자가 보는 사이트]
  헤더: 브랜드 | 고양이 용품 | 위키 | 골드박스
  상품 카드 → 파트너스 링크로 새 탭
  글 하단 → 카테고리별 관련 상품 4개
  하단 고정: 로켓프레시 | 로켓와우 | 블로그
```

---

## 3. 레포에서 실제로 쓰는 파일

### 사이트 (배포에 필요)

| 경로 | 역할 |
|---|---|
| `index.html` | 홈. 상품 그리드, 헤더, 위키 한 줄, 하단 바 |
| `data/config.json` | 히어로 문구, 골드박스 링크 |
| `data/products.json` | 사이트에 그리는 상품 목록 |
| `data/sheet-flags.json` | 시트에 빨강으로 표시할 행 (없음/중복) |
| `images/products/product-NNN.jpg` | 실제 상품 사진. SVG 임시그림은 커밋하지 않는다 |
| `wiki/index.html` | 위키 목록 |
| `wiki/wiki.js` | 마크다운 렌더, 목차, 관련 상품 |
| `wiki/guides.json` | 글 메타 + 하단 상품 카테고리 매핑 |
| `wiki/content/*.md` | 본문 (YAML 프론트매터 포함) |
| `wiki/{slug}.html` | 글 URL. `article.html`을 복사한 껍데기 |
| `wiki/article.html` | 글 템플릿. 새 글을 만들 때 이 파일을 복사 |

### 운영 (배포에는 안 나가도 레포에 있어야 함)

| 경로 | 역할 |
|---|---|
| `.github/scripts/sync-coupang-products.mjs` | 시트 → 제목/사진/카탈로그 |
| `.github/scripts/check-coupang-links.mjs` | 파트너스 링크 생존 점검 |
| `.github/workflows/sync-products.yml` | 수동 워크플로. **수집은 하지 않음** (안내만) |
| `.github/workflows/check-coupang-links.yml` | 매일 링크 점검, 실패 시 이슈 |
| `tools/google-apps-script/Code.gs` | 시트 메뉴·빨강 표시. **구글에 붙여 넣은 사본이 실제 동작** |
| `package.json` | `npm run sync`, `npm run catalog` |
| `.gitignore` | `node_modules`, `.env`, 수집 실패 로그 |
| `PLAYBOOK.md` | 이 문서 |

### 숨숨마을에서 바꿔야 하는 값 (새 주제 복제 시)

- 브랜드명, 폰트 톤, 히어로, 카테고리 배열
- 구글 시트 ID, 탭 이름 `광고용`
- Apps Script 웹앱 URL
- GitHub `raw` 플래그 URL (`Code.gs`의 `FLAGS_URL`)
- 쿠팡 파트너스 단축링크 (상품, 골드박스, 로켓프레시, 로켓와우)
- 블로그 URL
- 위키 글·카테고리·`productCategories` 매핑
- `classifyCategory()` 키워드

---

## 4. 구글 시트 계약

시트 ID 예시: `1hUNqA5ywL75YmRH-PwZ4K-_zSIpN75C8SFjgsQ9vtTg`  
탭 이름: **광고용** (스크립트가 이 이름을 CSV로 읽는다)

스크립트가 인식하는 헤더 (소문자 비교):

| 필수 | 별칭 |
|---|---|
| 1열 = 행 번호 `NO` | 숫자 ID. 사진 파일명 `product-001.jpg`와 같다 |
| 쿠팡 파트너스 링크 | `쿠팡파트너스 링크`, `상품 링크` |

있으면 쓰는 열:

- `상황 태그` / `카테고리`
- `상품명` / `실제 상품명`
- `상품 이미지 url`
- `상품 한줄설명`

규칙:

1. 한 행 = 한 파트너스 단축링크 (`https://link.coupang.com/a/...`).
2. 링크를 바꾸면 스크립트가 제목·사진을 **다시** 수집한다.
3. 같은 상품을 두 행에 넣으면 `productId` 기준으로 한쪽은 중복 처리된다.
4. 사이트는 **jpg가 있고**, 제목이 `고양이 용품 추천 N` 형태가 **아닌** 행만 보여 준다.

공개 CSV 주소 형식:

```
https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={탭이름 URL인코딩}
```

광고용 → `sheet=%EA%B4%91%EA%B3%A0%EC%9A%A9`

시트를 “링크만 있는 사람”과 “사이트에 나온 결과”가 같게 유지하려면, 수집 후 `data/sheet-flags.json`이 Apps Script로 빨강 행을 찍게 한다.

---

## 5. 쿠팡 이미지·제목 문제 (가장 중요한 함정)

### 무엇이 실패하는가

1. **쿠팡 상품 페이지를 직접 fetch 하면** Access Denied, 빈 HTML, 차단 제목이 나온다.
2. **쿠팡 CDN URL을 사이트에 그대로 넣으면** 나중에 깨지거나 핫링크가 막힌다.
3. **GitHub Actions에서 수집하면** 데이터센터 IP라 더 잘 막힌다.
4. **단축링크만으로는** 상품번호·사진 URL을 알 수 없다. 리다이렉트를 따라가야 한다.

### 실제로 쓰는 우회

1. `link.coupang.com/a/...` 를 따라가 ` /vp/products/{숫자} ` 또는 `ctag=` 에서 **상품번호**를 얻는다.
2. 네이버 검색 `https://search.naver.com/search.naver?query={상품번호}+쿠팡` HTML을 읽는다.
3. HTML에서 `thumbnail.coupangcdn.com` 이미지와 한글 상품명을 추출한다.
4. 이미지를 **파일로 저장**한다: `images/products/product-{NNN}.jpg`.
5. `products.json`의 `imageUrl`은 `./images/products/product-001.jpg` 같은 **상대 경로**만 쓴다.
6. jpg가 없으면 스크립트가 SVG 자리표시를 만들 수 있지만, 사이트는 jpg만 보여 주고 SVG는 git에 올리지 않는다. `data/sheet-update.csv`도 로컬 생성물이므로 커밋하지 않는다.

수집은 반드시 **본인 PC**에서:

```bash
npm run sync
```

이미 사진이 있고 링크가 안 바뀌었으면 다시 긁지 않는다.  
분류·중복만 다시 보려면:

```bash
npm run catalog
```

### 사이트 쪽 안전장치

홈/`wiki.js` 공통:

- `imageUrl`이 `.jpg`로 끝나지 않으면 숨긴다.
- 제목이 `/^고양이 용품 추천 /` 이면 숨긴다. (수집 실패 자리표시)
- 같은 `productId` 또는 같은 실제목은 한 번만 보여 준다.

그래서 “시트에 100행”이어도 화면에는 99장만 나올 수 있다. 숨숨마을은 18번이 30번과 같은 상품이라 `sheet-flags.json`의 `duplicates: [18]`로 남아 있다.

### 사진이 안 나올 때 할 일

1. 시트 링크가 살아 있는지 확인한다.
2. 로컬에서 `npm run sync` 후 `images/products/product-NNN.jpg` 가 생겼는지 본다.
3. 실패 행은 시트에서 **다른 파트너스 링크**로 바꾼다. (같은 상품의 다른 옵션/판매 페이지가 네이버에 더 잘 잡히기도 한다.)
4. jpg가 생기면 git에 커밋한다. JSON만 올리고 사진을 안 올리면 사이트는 깨진다.

---

## 6. Apps Script

파일: `tools/google-apps-script/Code.gs`  
**레포의 파일은 백업이다. 구글 시트에 붙여 넣은 프로젝트가 진짜다.**

배포:

1. 시트 → 확장 프로그램 → Apps Script.
2. `Code.gs` 내용을 붙여 넣는다.
3. `SPREADSHEET_ID`, `SOURCE_SHEET`, `FLAGS_URL`을 그 사이트에 맞게 고친다.
4. 웹 앱으로 배포. 실행 계정: 나, 액세스: 링크 있는 모든 사용자 (스크립트가 GET으로 `mark`를 부른다).
5. 웹 앱 URL을 `sync-coupang-products.mjs`의 `appsScriptUrl`에 넣는다.

동작:

- 메뉴 `사이트 상품 관리 → 빨간색으로 표시하기`
- 시트를 열면 `onOpen`이 GitHub `sheet-flags.json`을 읽어 표시
- `?action=mark&missing=7,20&duplicates=18` 로 로컬 싱크가 직접 표시

표시 의미:

- 빨강 + `이미지 없음 - 링크 교체`
- 빨강 + `중복 상품 - 다른 링크로 교체`
- 흰색 + `정상`

탭 `사이트용상품`은 요약본이다. 원장은 항상 **광고용**.

주의: 시트에 예전에 만든 다른 메뉴/스크립트가 남아 있으면 이 파일과 다를 수 있다. 복제할 때 **이 레포 버전으로 덮어쓴다.**

---

## 7. GitHub · Vercel

### GitHub

- 레포: 정적 파일만. `node_modules`는 커밋하지 않는다.
- `main`이 배포 브랜치.
- 상품 사진 jpg는 용량이 커져도 **반드시 커밋**한다. 사이트 자산이다.

### GitHub Actions

- `sync-products.yml`  
  수집을 Actions에서 돌리지 않는다. “로컬에서 모아라”는 안내만 한다.
- `check-coupang-links.yml`  
  매일 시트 링크 HTTP 상태를 본다. 실패하면 `link-check` 이슈를 연다.  
  시트가 비공개면 CSV fetch가 실패하므로, 광고용 탭은 링크가 있는 사람이 볼 수 있게 공유한다.

### Vercel

- GitHub 레포를 Import. Root = 레포 루트. 빌드 명령 없음. Output = `.`
- `index.html`이 `/`, `wiki/index.html`이 `/wiki/`
- 로컬 `npx serve` 는 `article.html?slug=` 를 `/wiki/article` 로 리다이렉트하면서 **쿼리를 버린다.**  
  그래서 글 URL은 `wiki/16-ileol-ttaen.html` 처럼 **파일명에 슬러그**를 넣는다.

---

## 8. 쇼핑몰 UI 규칙 (숨숨마을)

- 폰트: Jua(로고) + Gowun Dodum(본문), 배경 amber, 버튼 주황.
- 헤더: 브랜드 / `고양이 용품` / 위키 / 오늘의 골드박스.
- 홈 위키는 **큰 카드가 아니라 한 줄 칩**. 상품이 첫 화면에 보여야 한다.
- 카테고리 칩은 상품이 있는 것만.
- 제휴 고지 문장 고정:  
  `이 포스팅은 쿠팡 파트너스 활동으로 수수료를 제공받습니다.`  
  모바일에서 줄바꿈되면 안 되므로 `whitespace-nowrap` + 작은 글자.
- 하단 고정 스택 (아래부터): 블로그 주황 바, 그 위 로켓프레시 | 로켓와우.  
  `main`에 `pb-40` 을 줘서 마지막 상품이 바에 가리지 않게 한다.
- 상품 클릭은 모달이 아니라 **바로 파트너스 링크** (sponsored).

카테고리 목록 (`index.html`의 `CATEGORIES`와 분류 함수를 같이 맞춘다):

```
고양이 사료
고양이 모래
고양이 간식
스크래처 및 캣타워
위생 및 화장실 용품
장난감
그루밍
기타
```

---

## 9. 위키

### 왜 정적 HTML인가

마크다운을 `?slug=` 로 읽히면 `serve`/일부 호스트가 쿼리를 떨어뜨려 글이 안 열린다.  
해결: `wiki/article.html`을 `wiki/{slug}.html`로 복사하고, `wiki.js`가 경로 마지막 이름으로 md를 연다.

새 글 추가:

1. `wiki/content/{slug}.md` 작성. 내부 링크는 `/guides/{다른슬러그}` 형식을 유지해도 된다. `wiki.js`가 사이트에 있는 글은 `./{slug}.html`로, 없는 글은 블로그로 바꾼다.
2. `wiki/guides.json`에 메타를 넣는다. `productCategories`는 **쇼핑몰 카테고리 이름과 똑같아야** 하단에 상품이 뜬다.
3. `wiki/article.html`을 `wiki/{slug}.html`로 복사한다.
4. 홈 칩·위키 목록은 `guides.json`/홈 HTML을 직접 고친다.

글 페이지 구성:

- 진료 대체 아님 고지
- 목차 (모바일은 접힘, 데스크톱은 펼침)
- 본문 테이블·내부 링크
- 하단: 카테고리별 관련 상품 최대 4개, 빈 그룹은 숨김
- 같은 로켓/블로그 바

사이트에 올리지 않는 글(입양, 첫 7일, 건강 검진, 생애주기, 다묘, 여행, DIY)은 위키 목록 아래 블로그 CTA로만 보낸다.

---

## 10. 새 주제로 복제하는 순서

주제를 강아지 / 육아 / 캠핑 등으로 바꿀 때.

1. **이 레포를 복제하지 말고** 새 GitHub 레포를 만든다. 상품 JSON·사진을 그대로 가져가면 제휴가 섞인다.
2. 이 레포에서 **코드만** 가져온다: `index.html`, `wiki` 껍데기, `.github/scripts`, Apps Script, `package.json`, `.gitignore`, 이 플레이북.
3. `data/products.json`은 `[]`, `sheet-flags.json`은 `{ "missing": [], "duplicates": [] }`.
4. `images/products/`는 비운다.
5. 새 구글 시트 `광고용`을 만들고 파트너스 링크를 넣는다.
6. 스크립트의 시트 ID, Apps Script URL, `FLAGS_URL`, 분류 키워드, 카테고리 배열, 브랜드, 블로그, 하단 바 링크를 모두 바꾼다.
7. 로컬에서 `npm run sync` → jpg와 JSON을 확인 → 커밋 → Vercel 연결.
8. 위키 글은 그 주제에 맞게 md를 새로 쓴다. 의료/전문 고지는 주제에 맞게 문장을 바꾼다.
9. 쿠팡 파트너스 고지 문구는 가이드가 요구하는 문장을 **빼지 않는다.**

---

## 11. 자주 하는 운영

| 하고 싶은 일 | 방법 |
|---|---|
| 상품 추가 | 시트 다음 번호에 링크 → `npm run sync` → jpg/JSON 커밋 |
| 상품 교체 | 그 행 링크만 변경 → sync가 재수집 |
| 골드박스 바꾸기 | `data/config.json`의 `featuredLink` |
| 히어로 문구 | 같은 파일 `hero` |
| 위키 글 수정 | `wiki/content/*.md`만 고치면 된다. HTML 껍데기는 그대로 |
| 링크 점검 | Actions `Check Coupang product links` 또는 로컬에서 해당 스크립트 |

OneDrive 폴더에 레포가 있으면 파일 쓰기가 가끔 잠긴다. 싱크 스크립트의 `writeFileRetry`가 그래서 있다.

---

## 12. 하지 말 것

- 쿠팡 상품 페이지를 크롤링하는 새 우회를 GitHub Actions에 올리지 않는다.
- Next.js 위키 앱을 이 정적 사이트에 합치지 않는다.
- 상품 사진을 쿠팡 CDN URL로만 저장하지 않는다.
- 제휴 고지를 빼거나 작은 글자를 접히게 만들지 않는다.
- `node_modules`를 커밋하지 않는다.
- 위키 글 중간에 상품 카드를 끼워 넣지 않는다. 하단 그룹만.

---

## 13. 숨숨마을 기준 현재 상태 (2026-09)

- 사이트: 정적 HTML, 헤더 `고양이 용품 | 숨숨위키`
- 홈 위키: 한 줄 칩 (이럴 땐 / 바디랭귀지 / 사료 / 화장실 / 전체)
- 위키 본문 10편, 나머지 블로그
- 카탈로그: 실사진 jpg + 실제목만 표시. 18번은 30번 중복으로 플래그
- 수집: 로컬 `npm run sync`, Actions 수집 없음
- 배포: GitHub `main` + Vercel
