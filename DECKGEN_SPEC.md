# DeckGen — AI 프레젠테이션 생성 도구 MVP 스펙 (Claude Code 구현 지시서)

> 이 문서는 Claude Code가 프로젝트를 처음부터 끝까지 구현하기 위한 단일 소스 문서다.
> 아래 Phase 순서대로 구현하고, 각 Phase의 **완료 기준(Acceptance Criteria)** 을 모두 통과한 뒤 다음 Phase로 넘어간다.
> 프로젝트 코드네임은 `deckgen`이며, 제품명은 추후 변경 가능하다.

---

## 1. 제품 개요

### 1.1 한 줄 정의
사용자가 주제를 자연어로 입력하면 AI가 논리 구조(아웃라인)를 먼저 설계하고, 이를 슬라이드로 렌더링한 뒤, 캔버스 에디터와 AI 채팅으로 수정하고, 편집 가능한 PPTX로 내보내는 웹 애플리케이션.

### 1.2 핵심 설계 철학 (반드시 준수)
1. **단일 중간 표현(Single Source of Truth)**: 모든 슬라이드는 `DeckSchema`(JSON)로 표현된다. AI는 이 JSON을 생성/수정하고, Fabric.js는 이 JSON을 렌더링하며, pptxgenjs는 이 JSON을 PPTX로 변환한다. Fabric 객체나 DOM이 원본이 되어서는 안 된다.
2. **2단계 생성**: 슬라이드를 바로 그리지 않는다. ① 텍스트 아웃라인(제목·불릿·시각화 지시문) 생성 → 사용자 확인/수정 → ② 슬라이드 스펙 생성 순서를 지킨다.
3. **레이아웃은 결정적(deterministic)**: LLM이 픽셀 좌표를 직접 찍지 않는다. LLM은 "레이아웃 템플릿 ID + 콘텐츠"를 선택하고, 좌표 계산은 코드(레이아웃 엔진)가 담당한다. 결과 안정성의 핵심.
4. **좌표계 고정**: 슬라이드 논리 좌표계는 **1920 × 1080 (16:9)** 고정. PPTX 변환 시 1920px = 13.333inch (즉 **144px = 1inch**)로 매핑한다.

### 1.3 MVP 범위
| 포함 | 제외 (2차 이후) |
|---|---|
| 프롬프트 → 아웃라인 → 슬라이드 생성 | 웹 리서치, 이미지 생성, Auto Agent |
| Fabric.js 캔버스 에디터 (이동/크기/회전/텍스트 편집/undo·redo) | |
| 테마 시스템 (4종 내장) | |
| **PPTX 가져오기 — Import(그대로 편집) / Reference(아웃라인 추출)** (§9.2) | |
| **4:5 카드뉴스 캐러셀 모드** (1080×1350 · 훅/저장/CTA 규칙 · 캐러셀 스타일 4종) | |
| **AI 수정 before/after 비교 후 적용** | |
| AI 채팅 수정 (선택 슬라이드 대상 Magic Edit) | 계정(로그인) |
| PPTX 내보내기 (텍스트·도형·차트 편집 가능 상태로) | Auto Agent(멀티스텝 에이전트) |
| 로컬 저장 (localStorage 자동 저장) | |
| **공유 링크 + 권한 분리(보기/편집) + 간이 실시간 협업** (§12) | |
| **스토리보드 와이어프레임 템플릿** (§13) | |

---

## 2. 기술 스택 & 프로젝트 구조

### 2.1 스택
- **프론트엔드**: Vite + React 18 + TypeScript, Zustand(+zundo로 undo/redo), Fabric.js **v6**, Tailwind CSS, pptxgenjs(브라우저에서 실행)
- **백엔드**: Node.js 20 + Express + TypeScript, `@anthropic-ai/sdk`, SSE(Server-Sent Events) 스트리밍
- **모델**: 기본 `claude-sonnet-4-6` (환경변수 `ANTHROPIC_MODEL`로 교체 가능)
- **개발 환경**: Windows 기준. 실행 스크립트는 크로스플랫폼으로 작성 (`concurrently` 사용)

### 2.2 모노레포 구조
```
deckgen/
├── package.json              # workspaces + concurrently 스크립트
├── client/
│   ├── src/
│   │   ├── app/              # 라우팅, 전역 레이아웃
│   │   ├── components/
│   │   │   ├── home/         # 홈(프롬프트 입력, 덱 목록)
│   │   │   ├── outline/      # 아웃라인 확인/수정 화면
│   │   │   ├── editor/       # 캔버스 에디터 (3패널)
│   │   │   └── ui/           # 공용 버튼/입력/모달
│   │   ├── engine/
│   │   │   ├── schema.ts     # DeckSchema 타입 정의 (§3)
│   │   │   ├── layout.ts     # 레이아웃 엔진 (§5)
│   │   │   ├── themes.ts     # 테마 토큰 (§6)
│   │   │   ├── fabricRenderer.ts  # Schema → Fabric 객체 (§7)
│   │   │   ├── fabricSync.ts      # Fabric 편집 → Schema 역동기화
│   │   │   └── pptxExporter.ts    # Schema → PPTX (§9)
│   │   ├── store/
│   │   │   ├── deckStore.ts  # Zustand + zundo (deck 상태, undo/redo)
│   │   │   └── uiStore.ts    # 선택 상태, 패널 상태
│   │   ├── api/client.ts     # 백엔드 호출 + SSE 파서
│   │   └── main.tsx
│   └── ...
├── server/
│   ├── src/
│   │   ├── index.ts          # Express 엔트리
│   │   ├── routes/ai.ts      # /api/outline, /api/slides, /api/edit
│   │   ├── ai/
│   │   │   ├── anthropic.ts  # SDK 클라이언트, JSON 강제 유틸
│   │   │   ├── prompts.ts    # 시스템 프롬프트 (§8)
│   │   │   └── validate.ts   # zod 스키마 검증 + 재시도
│   │   └── sse.ts            # SSE 헬퍼
│   └── ...
└── .env.example              # ANTHROPIC_API_KEY, ANTHROPIC_MODEL, PORT
```

### 2.3 실행 스크립트
- `npm run dev` → client(5173) + server(3001) 동시 실행
- client의 `/api/*`는 Vite proxy로 server에 전달
- **API 키는 절대 클라이언트에 노출하지 않는다** (서버 환경변수만 사용)

---

## 3. 데이터 스키마 (DeckSchema) — 최우선 구현

`client/src/engine/schema.ts`에 정의하고, 서버에서도 동일 스키마를 zod로 검증한다.

```typescript
// ===== 최상위 =====
interface Deck {
  id: string;
  title: string;
  themeId: string;            // themes.ts의 키
  aspect: "16:9";             // MVP 고정
  slides: Slide[];
  createdAt: number;
  updatedAt: number;
}

interface Slide {
  id: string;
  layout: LayoutId;           // 레이아웃 템플릿 ID (§5)
  elements: SlideElement[];   // 렌더링 순서 = z-order
  notes?: string;
}

// ===== 요소 =====
type SlideElement = TextElement | ShapeElement | ChartElement | ImageElement;

interface ElementBase {
  id: string;
  x: number; y: number;       // 1920×1080 좌표계, 좌상단 기준
  w: number; h: number;
  rotation?: number;          // deg
  opacity?: number;           // 0~1
}

interface TextElement extends ElementBase {
  type: "text";
  text: string;               // 줄바꿈은 \n
  role: "title" | "subtitle" | "heading" | "body" | "caption" | "kpi-value" | "kpi-label";
  align?: "left" | "center" | "right";
  color?: string;             // 미지정 시 테마의 role 기본색
  fontSize?: number;          // 미지정 시 role 기본값 (§6.2)
  fontWeight?: number;
  lineHeight?: number;        // 배수, 기본 1.4
  letterSpacing?: number;     // px (자간)
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

interface ShapeElement extends ElementBase {
  type: "shape";
  shape: "rect" | "roundRect" | "ellipse" | "line" | "arrow" | "pie";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;            // roundRect 전용
  slope?: "down" | "up";      // line 전용 — 대각선(박스 좌상→우하 / 좌하→우상). 미지정 시 수평
  angleStart?: number;        // pie 전용 — 시작각 deg (0°=3시 방향, 시계방향)
  angleEnd?: number;          // pie 전용 — 끝각 deg
}

interface ChartElement extends ElementBase {
  type: "chart";
  chartType: "bar" | "line" | "pie";
  title?: string;
  labels: string[];           // x축 라벨
  series: { name: string; values: number[] }[];
}

interface ImageElement extends ElementBase {
  type: "image";
  src: string;                // MVP: 사용자가 업로드한 dataURL만 지원
  fit: "cover" | "contain";
}
```

**규칙**
- 모든 색상값은 hex 문자열 **또는 테마 토큰**(`@bg` `@surface` `@accent` `@textPrimary` `@textSecondary`). 토큰은 렌더러/내보내기 시점에 현재 테마 색으로 해석된다 → 테마 전환 시 도형 색도 자동 재해석. 요소에 색이 없으면 렌더러가 테마에서 role 기반으로 해석한다.
- `Slide.elements`의 배열 순서가 z-order다. 별도 zIndex 필드를 만들지 않는다.
- 스키마 변경이 필요하면 이 문서의 §3을 먼저 갱신한 뒤 코드에 반영한다.

---

## 4. 사용자 플로우 & 화면 명세

### 4.1 전체 플로우
```
[홈] 프롬프트 입력 (+슬라이드 수, 테마 선택)
  → [아웃라인] AI가 슬라이드별 제목/불릿/시각화 지시 생성 (SSE 스트리밍 표시)
      사용자가 텍스트로 자유 수정 가능
  → [생성] 슬라이드별 스펙 생성 (진행 상태: Queued → Generating → Done)
  → [에디터] 3패널 편집 + AI 채팅 수정
  → [내보내기] PPTX 다운로드
```

### 4.2 화면별 명세

**A. 홈 (`/`)**
- 중앙에 큰 프롬프트 입력창 (placeholder: "예: 소상공인 경영바우처 지원 제안서를 만들어줘")
- 하단 옵션: 슬라이드 수 스텝퍼(3~12, 기본 5), 테마 선택 드롭다운
- 아래에 "내 덱" 그리드 (localStorage에 저장된 덱 카드 + 새 덱 버튼)
- 생성 버튼 클릭 → `/outline`으로 이동, 아웃라인 요청 시작

**B. 아웃라인 (`/deck/:id/outline`)**
- 좌측: 단계 안내 텍스트("AI가 콘텐츠 구조를 먼저 정리합니다"), [뒤로]/[슬라이드 생성] 버튼
- 우측: 슬라이드별 카드 리스트. 각 카드 = 제목(input) + 불릿(textarea) + 시각화 지시(select: 없음/bar/line/pie/kpi-cards/process)
- SSE로 아웃라인이 도착하는 대로 카드가 순차적으로 나타난다 (스켈레톤 → 내용)
- 모든 필드는 즉시 편집 가능. [슬라이드 생성] 클릭 시 수정된 아웃라인을 서버로 전송

**C. 에디터 (`/deck/:id/edit`) — 3패널**
- **좌측 패널(240px)**: 슬라이드 썸네일 리스트(현재 슬라이드 하이라이트, 클릭 이동, 하단 + 버튼으로 빈 슬라이드 추가, 우클릭: 복제/삭제)
- **중앙**: Fabric.js 캔버스. 1920×1080 논리 크기를 컨테이너에 맞게 스케일(zoom fit). Ctrl+휠 줌, Space+드래그 팬
- **우측 패널(320px)**: 탭 2개
  - `AI 채팅`: 현재 슬라이드 대상 수정 지시 입력 → §8.3 edit API 호출 → 결과 diff 적용. 메시지 히스토리 표시
  - `속성`: 선택 요소의 x/y/w/h/색/폰트크기/정렬 편집 폼 (Schema에 직접 반영)
- **상단 바**: 덱 제목(inline edit), Undo/Redo 버튼, 테마 변경 드롭다운, [PPTX 내보내기] 버튼
- **생성 중 상태**: 아직 생성 안 된 슬라이드 썸네일에는 "Queued"/"Generating" 배지 표시, 완료되는 대로 순차 렌더

### 4.3 키보드 단축키
`Ctrl+Z`/`Ctrl+Shift+Z`(undo/redo), `Delete`(요소 삭제), `Ctrl+D`(복제), `Esc`(선택 해제), 방향키(1px 이동, Shift+방향키 10px)

---

## 5. 레이아웃 엔진 (`engine/layout.ts`)

LLM은 레이아웃 ID와 콘텐츠만 정하고, 좌표는 이 모듈이 계산한다.

### 5.1 레이아웃 템플릿 (MVP 7종)
```typescript
type LayoutId =
  | "cover"          // 표지: 좌측 정렬 대형 타이틀 + 서브타이틀 + 발표자
  | "title-bullets"  // 제목 + 불릿 리스트 (기본형)
  | "title-bullets-chart"  // 좌: 제목+불릿 / 우: 차트
  | "chart-focus"    // 제목 + 대형 차트
  | "kpi-cards"      // 제목 + 2~4개 숫자 카드
  | "two-column"     // 제목 + 좌우 2단 텍스트 블록
  | "section"        // 섹션 구분: 중앙 대형 텍스트만
```

### 5.2 동작 방식
```typescript
// 입력: 레이아웃 ID + 콘텐츠 조각(SlideContent), 출력: 좌표가 확정된 SlideElement[]
function composeSlide(layout: LayoutId, content: SlideContent, theme: Theme): SlideElement[]
```
- 공통 여백: 상하좌우 **96px**. 제목 영역 높이 160px, 본문은 그 아래.
- `title-bullets-chart`: 본문 영역을 좌 55% / 우 45%로 분할.
- `kpi-cards`: 카드 개수(2~4)에 따라 균등 분할, 카드 간격 32px, 카드 = roundRect + kpi-value + kpi-label.
- 불릿 렌더링: 각 불릿을 개별 TextElement로 만들지 말고, `\n` 조인된 하나의 body TextElement + 각 줄 앞에 "•  " 접두. (편집 단순화)
- 텍스트 오버플로 처리: 불릿 6줄 초과 시 fontSize를 단계적으로 축소(최소 20px), 그래도 넘치면 잘라내고 notes에 이동.

---

## 6. 디자인 시스템

### 6.1 앱 UI (에디터 자체의 디자인)
- **폰트**: Pretendard (client에 npm `pretendard` 패키지로 self-host)
- **팔레트** (라이트 UI):
  - 배경 `#F7F7F5`, 서피스 `#FFFFFF`, 보더 `#E4E4E0`
  - 텍스트 주 `#1A1A1A`, 보조 `#6B6B66`
  - 액센트 **바이올렛 `#6D4AFF`** (버튼, 선택 하이라이트, 진행 표시)
  - 위험 `#E5484D`
- 캔버스 주변은 `#EDEDEA`로 살짝 어둡게 → 슬라이드가 종이처럼 떠 보이게 그림자 처리
- 버튼: 기본 검정 배경 흰 글자, 라운드 10px. 액센트는 주요 CTA(생성/내보내기)에만
- 시그니처 요소: 생성 진행 시 우측 패널에 **에이전트 작업 로그**("아웃라인 구성 중 → 시각화 결정 중 → 슬라이드 3 렌더링") 타임라인 형태로 표시

### 6.2 슬라이드 테마 (내장 4종, `engine/themes.ts`)
```typescript
interface Theme {
  id: string; name: string;
  bg: string; surface: string;         // 슬라이드 배경, 카드 배경
  textPrimary: string; textSecondary: string;
  accent: string;
  chartPalette: string[];              // 4색
  fontFamily: string;                  // MVP: "Pretendard" 고정
  roleStyles: Record<TextRole, { fontSize: number; fontWeight: number; color: keyof ThemeColors }>;
}
```
| id | 콘셉트 | bg | accent |
|---|---|---|---|
| `clean-light` | 밝은 비즈니스 기본 | #FFFFFF | #2563EB |
| `ink-dark` | 다크 발표용 | #14141A | #7C9CFF |
| `warm-craft` | 웜톤 제안서 | #FAF6EF | #C25E3A |
| `violet-bold` | 스타트업 피치 | #0F0B1E | #8B6BFF |

**role 기본 크기**: title 72 / subtitle 36 / heading 44 / body 28 / caption 20 / kpi-value 64 / kpi-label 22 (px, 1920 기준)

테마 변경 시: 요소에 명시적 color/fontSize가 **없는** 값만 새 테마로 재해석되어야 한다 → 렌더러가 항상 "요소 값 ?? 테마 role 값" 순으로 해석하면 자동 달성.

---

## 7. Fabric.js 렌더러 & 역동기화

### 7.1 렌더 (`fabricRenderer.ts`)
- `renderSlide(canvas, slide, theme)`: Schema → Fabric 객체 생성. 각 Fabric 객체에 `data: { elementId }` 부착
- Text → `fabric.Textbox`(줄바꿈·너비 고정 편집), Shape → Rect/Ellipse/Line/Path, Image → `fabric.Image`
- **Chart는 Fabric 그룹으로 직접 그린다**: bar = Rect 배열 + 라벨 Textbox, line = Polyline + 원, pie = 부채꼴 Path. 외부 차트 라이브러리 사용 금지 (PPTX 변환·편집 일관성 때문). 차트 그룹은 통째로 이동/크기조절 가능
- **차트 분해(ungroup)**: 차트 더블클릭(또는 속성 패널 "개별 요소로 분해") 시 ChartElement가 동일 기하의 일반 요소들(roundRect 막대·pie 조각·slope line 선분·text 라벨)로 스키마에서 치환된다 → 막대 색·라벨 등 **모든 조각을 개별 선택/수정 가능**. 분해 수학은 렌더러와 단일 소스(`chartDecompose.ts`) 공유 — 분해 전후 픽셀 동일. 분해 후에는 PPTX에 네이티브 차트가 아닌 도형으로 내보내지며, undo로 복원 가능
- 캔버스는 `setDimensions`로 1920×1080 유지, CSS 스케일로 화면 맞춤

### 7.2 역동기화 (`fabricSync.ts`)
- `object:modified` 이벤트 → 해당 elementId의 Schema를 갱신 (x/y/w/h/rotation, scaleX/Y는 w/h에 반영 후 1로 리셋)
- Textbox 편집 완료(`editing:exited`) → text 갱신
- **Schema 갱신은 반드시 deckStore 액션을 통해서만** (zundo가 히스토리를 잡을 수 있도록). Fabric → store → (재렌더는 하지 않고 값만 동기화) 단방향 유지, 무한 루프 주의

### 7.3 Undo/Redo
- zundo로 `deck.slides`만 추적. undo/redo 발생 시 현재 슬라이드를 **전체 재렌더**하는 단순 전략 사용 (MVP에서는 성능 충분)
- Fabric 드래그 중간 상태는 히스토리에 넣지 않는다 (`object:modified` 시점에만 커밋)

---

## 8. AI 파이프라인 (서버)

### 8.1 공통 규칙
- 모든 엔드포인트는 Anthropic SDK 사용, 시스템 프롬프트는 `ai/prompts.ts`에 상수로 분리
- **JSON 강제 전략**: 시스템 프롬프트에 "JSON만 출력, 마크다운 백틱 금지" 명시 + 응답에서 ```` ```json ```` 제거 후 `JSON.parse` + zod 검증. 실패 시 오류 메시지를 포함해 **1회 자동 재요청**, 재실패 시 502 반환
- 사용자의 입력 언어를 감지해 같은 언어로 콘텐츠 생성 (프롬프트에 명시)

### 8.2 엔드포인트

**① `POST /api/outline`** — 아웃라인 생성 (SSE)
```
요청: { prompt: string, slideCount: number }
응답(SSE): event: slide → { index, title, bullets: string[], viz: null | { type: "bar"|"line"|"pie"|"kpi-cards"|"process", note: string } }
          event: done
```
시스템 프롬프트 요지: "너는 프레젠테이션 전략가다. 주제를 받아 slideCount장의 논리적 흐름(도입→문제→해결→근거→마무리 등 주제에 맞는 서사)을 설계하라. 각 슬라이드는 title(15자 내외), bullets(2~5개, 각 60자 이내), 데이터로 보여주는 게 나은 내용이면 viz를 지정하라. viz.note에는 차트가 표현할 내용을 한 문장으로 써라. 슬라이드 하나가 완성될 때마다 한 줄에 하나의 JSON 객체로 출력하라(JSONL)." → 서버는 스트림에서 줄 단위 파싱해 SSE로 중계

**② `POST /api/slides`** — 슬라이드 스펙 생성 (SSE, 슬라이드별 순차)
```
요청: { outline: OutlineSlide[], themeId: string }
응답(SSE): event: slide-spec → { index, layout: LayoutId, content: SlideContent }
```
`SlideContent` = { title, bullets?, chart?: {chartType, title, labels, series}, kpis?: {value,label}[], columns?: ... }
시스템 프롬프트 요지: "각 아웃라인 항목에 대해 가장 적합한 layout을 선택하고 content를 채워라. viz가 bar/line/pie면 note를 근거로 **그럴듯한 예시 수치**를 만들되 labels 2~6개, series 1~2개로 제한하라. 수치는 [예시] 임이 자연스럽게 드러나도 좋다. 좌표를 출력하지 마라." → 서버가 받은 content를 그대로 클라이언트에 전달, **클라이언트의 layout 엔진이 composeSlide로 좌표 확정**

**③ `POST /api/edit`** — AI 수정 (Magic Edit)
```
요청: { instruction: string, slide: Slide, theme: Theme요약 }
응답: { slide: Slide }  // 수정된 전체 슬라이드
```
시스템 프롬프트 요지: "주어진 Slide JSON을 사용자 지시에 따라 수정해 **같은 스키마의 완전한 JSON으로만** 반환하라. 지시와 무관한 요소·id·좌표는 유지하라. 텍스트 톤 변경, 요소 추가/삭제, 색 변경, 차트 수치 변경이 가능하다. 스키마 규칙: (§3 스키마를 프롬프트에 포함)"
클라이언트는 응답 slide로 교체 후 재렌더 + 히스토리 커밋. 채팅 패널에 "적용됐어요" 계열 확인 메시지 표시

### 8.3 비용/안정 가드
- `max_tokens`: outline 2000, slides 슬라이드당 1500, edit 2000
- 서버에 간단한 rate limit (IP당 분당 10회)
- SSE 연결에 30초 무응답 타임아웃 + 클라이언트 재시도 1회

---

## 9. PPTX 내보내기 (`engine/pptxExporter.ts`)

pptxgenjs를 클라이언트에서 실행. 변환 규칙:

| Schema | pptxgenjs | 비고 |
|---|---|---|
| 좌표 x,y,w,h | x/144, y/144 … (inch) | 144px = 1inch |
| TextElement | `slide.addText` | fontFace "Pretendard", 없으면 시스템 대체. align, color, bold(fontWeight≥600), lineSpacing 반영 |
| Shape rect/roundRect/ellipse | `slide.addShape` | roundRect는 rectRadius |
| line/arrow | `slide.addShape("line")` | arrow는 lineTail 옵션 |
| ChartElement | **`slide.addChart`** (BAR/LINE/PIE) | 네이티브 차트로 내보내 PowerPoint에서 데이터 편집 가능하게. 색은 theme.chartPalette |
| ImageElement | `slide.addImage` | dataURL 그대로 |
| 슬라이드 배경 | `slide.background = { color: theme.bg }` | |

- 파일명: `{덱제목}.pptx`, 16:9 (`pptx.defineLayout({ name:"WIDE", width:13.333, height:7.5 })`)
- 완료 기준: 내보낸 파일을 PowerPoint에서 열었을 때 텍스트 편집 가능, 차트 더블클릭 시 데이터 시트가 열림

### 9.1 Figma 핸드오프 (`engine/figmaExporter.ts`)
- 형식: **슬라이드별 SVG 벡터 묶음(.zip)** — Fabric 렌더 트리를 `canvas.toSVG()`로 벡터화. `.fig`는 비공개 바이너리 포맷이라 채택하지 않음(SVG가 Figma 공식 임포트 경로).
- 파일명 `NN 슬라이드제목.svg` → Figma에 드래그하면 레이어 이름·순서로 반영. 텍스트=text 레이어(tspan 줄바꿈 유지), 도형·차트=벡터 레이어, 이미지=dataURL 임베드, z-order=스키마 순서.
- 폰트는 Pretendard 기준 — Figma 환경에 없으면 대체 폰트 표시(README.txt 동봉 안내).

### 9.2 PPTX 가져오기 (`engine/pptxImport.ts`)
- 클라이언트에서 OOXML 파싱(JSZip+DOMParser). EMU→px 스케일, 세로형 파일은 4:5로 판정.
- 변환 범위: 텍스트 상자(폰트 크기·굵기·색·정렬·불릿), 기본 도형(rect/roundRect/ellipse+solidFill), 이미지(dataURL). **차트/표/그룹은 제외하고 개수를 슬라이드 notes에 기록**(억지 변환 금지).
- 두 경로: **Import** = DeckSchema로 열어 그대로 편집 / **Reference** = 슬라이드별 제목·불릿을 아웃라인으로 추출 → 확인 후 재생성. 홈 프롬프트 카드에 첨부 칩+인라인 선택 UI.
- 좌표계·비율: aspect는 `Deck.aspect`("16:9"|"4:5")로 일반화, 레이아웃 엔진·렌더러·내보내기(PPTX/Figma) 모두 dims 파라미터화.

---

## 10. 구현 단계 (Phase Plan)

### Phase 0 — 스캐폴딩
- 모노레포, Vite+React+TS, Express+TS, Tailwind, 환경변수, dev 스크립트, ESLint/Prettier
- ✅ 완료 기준: `npm run dev`로 두 서버 기동, `/api/health` 200, 홈 화면 빈 셸 렌더

### Phase 1 — 스키마 + 정적 렌더러
- §3 스키마, §6 테마, §5 레이아웃 엔진, §7.1 렌더러 구현
- 하드코딩된 샘플 Deck(7개 레이아웃 각 1장)을 에디터 화면에서 렌더
- ✅ 완료 기준: 7종 레이아웃이 모두 테마 4종에서 깨짐 없이 렌더, 테마 전환 즉시 반영

### Phase 2 — 에디터 인터랙션
- 선택/이동/리사이즈/회전/텍스트 인라인 편집 → Schema 역동기화(§7.2), undo/redo(§7.3), 속성 패널, 썸네일 패널, 슬라이드 추가/복제/삭제, 줌/팬, 단축키(§4.3), localStorage 자동 저장(debounce 1초)
- ✅ 완료 기준: 요소 드래그 후 Ctrl+Z로 정확히 복원, 새로고침 후 덱 유지

### Phase 3 — 아웃라인 생성
- 서버 `/api/outline`(SSE) + 프롬프트, 홈 입력 → 아웃라인 화면 스트리밍 표시 + 수정 UI
- ✅ 완료 기준: 임의 주제 입력 시 5장 아웃라인이 순차 표시되고 모든 필드 수정 가능

### Phase 4 — 슬라이드 생성
- 서버 `/api/slides`(SSE), 클라이언트에서 composeSlide로 좌표 확정 → 에디터로 이동하며 Queued→Generating→Done 순차 렌더
- ✅ 완료 기준: 아웃라인의 viz 지정이 실제 차트/KPI 카드로 나타나고, 생성 직후 바로 편집 가능

### Phase 5 — AI 채팅 수정
- 서버 `/api/edit`, 우측 채팅 탭 UI, 적용 + 히스토리 커밋
- ✅ 완료 기준: "제목을 더 임팩트 있게", "차트를 파이로 바꿔줘", "불릿 하나 추가해줘" 3종 지시가 모두 정상 반영되고 undo 가능

### Phase 6 — PPTX 내보내기
- §9 전체 구현
- ✅ 완료 기준: PowerPoint에서 텍스트 편집·차트 데이터 편집 가능, 레이아웃 좌표 오차가 시각적으로 없음

### Phase 7 — 폴리시
- 홈 덱 목록(썸네일 = 1번 슬라이드 축소 렌더 dataURL), 로딩/에러/빈 상태 문구 정비, 반응형 최소 대응(1280px+), 에이전트 작업 로그 UI
- ✅ 완료 기준: 신규 사용자가 안내 없이 프롬프트→PPTX까지 완주 가능

---

## 11. 품질 규칙
- TypeScript strict, `any` 금지 (외부 라이브러리 경계 제외)
- Schema 변경은 zod 스키마와 동시 변경
- AI 응답은 신뢰하지 않는다: 항상 zod 검증 → 실패 시 재시도 → 그래도 실패면 사용자에게 재생성 버튼 제공
- 커밋 단위: Phase 내 기능 단위로 분리, 메시지는 conventional commits
- 각 Phase 종료 시 완료 기준을 스스로 검증하고 결과를 보고할 것

## 12. 공유 · 협업 (계정 없는 링크 기반)

- **공유 모델**: 덱 공유 시 서버가 덱을 저장하고 `editToken`/`viewToken` 2개를 발급. 링크 = `/s/:token`. 토큰이 곧 권한(계정 없음). 소유자는 로컬 덱을 유지하며 공유 후에는 서버와 동기화.
- **권한**: `edit` = 캔버스/속성/노트/AI 채팅/슬라이드 구조 편집 가능. `view` = 열람 + PPTX 내보내기만(편집 UI 숨김, 캔버스 선택 비활성).
- **동기화(간이 실시간)**: 슬라이드 단위 Last-Write-Wins.
  - 클라이언트는 로컬 store 변경을 감지해 변경된 슬라이드만 `POST /api/collab/:deckId/slide`로 push (구조 변경·제목·테마는 덱 전체 push).
  - 서버는 rev를 올리고 SSE(`GET /api/collab/:deckId/events`)로 전 참여자에게 브로드캐스트. 수신 측은 origin(clientId)이 자신이면 무시, 아니면 해당 슬라이드 교체(재렌더).
  - 같은 슬라이드 동시 편집은 나중 쓰기가 이김(MVP 허용). CRDT/OT는 2차.
- **프레즌스**: SSE 접속 시 등록 + 10초 하트비트(현재 슬라이드 인덱스 포함). 상단 아바타 + 썸네일에 보고 있는 사람 점 표시. 30초 무응답 시 제거.
- **저장소**: 서버 `data/decks/*.json` (파일 기반, git 제외). 게스트(공유 링크 진입자)는 localStorage 자동 저장을 하지 않음.
- **엔드포인트**: `POST /api/share`(덱 등록→토큰 발급) · `GET /api/share/:token`(덱+권한 조회) · `POST /api/collab/:id/slide|deck|presence` · `GET /api/collab/:id/events`(SSE). AI 라우트의 rate limit 미적용.

## 13. 스토리보드 와이어프레임 템플릿

- 목표: **완성된 장표가 아니라, 팀이 함께 채워 나가는 스토리보드형 와이어프레임**을 즉시 생성.
- 홈에서 와이어프레임 라이브러리(제안서/피치덱/제품 소개/빈 스토리보드) 선택 → AI 호출 없이 프레임 시퀀스로 덱 생성 → 에디터로 이동.
- 각 프레임 = 편집 가능한 제목/텍스트 자리 + 회색 플레이스홀더 존(이미지·차트·데이터 영역, rect+라벨) + 발표자 노트에 작성 가이드. 모든 요소는 §3 스키마 그대로(전용 타입 없음) → 편집·협업·PPTX 내보내기 동일 동작.
