# DeckGen 시안 반영 체크리스트

DeckGenPackage 시안(Prototype·Admin·Design·Demo·Backend·Invite) 전체 분석 기준. 구현하며 `[ ]` → `[x]` 갱신.

## 범례
- ✅ 이미 구현됨 (이번 라운드 이전)
- ⬜ 미구현 → 반영 대상
- 🔷 2차/백엔드 의존(계정·결제 등) — 클라이언트 시뮬레이션으로 반영 가능분만

---

## Wave 1 — 에디터 캔버스 파워 (Figma식, Demo Act 5·5.5)
- [x] E1 도형 서브메뉴: 삼각형·다이아몬드·별·알약·선·화살표 (툴바 드롭다운)
- [x] E4 마퀴 다중 선택 (Fabric 네이티브)·다중 이동/삭제 선택 (빈 곳 드래그 → 다중)
- [x] E5 그룹/해제 (Ctrl+G / Ctrl+Shift+G)
- [x] E6 스냅 가이드 (중앙·여백 점선)
- [x] E8 우클릭 컨텍스트 메뉴 (요소: 잠금/복사/복제/z-order/삭제 · 캔버스: 붙여넣기/도형추가/자동정리)
- [x] E9 정렬·분배 버튼 (6정렬 + 가로/세로 분배)
- [x] E10 슬라이드 자동 정리 (✨ 여백 그리드 재배치)
- [x] E11 서식 복사/붙여넣기 (제목 스타일)
- [x] E12 미니맵 (좌하단)
- [x] E13 슬라이드 검색 (제목/본문/노트)
- [x] E14 개요 그리드 (드래그 순서 + 섹션)
- [x] E15 New-slide 드롭다운 (빈/AI/다시생성)
- [x] E16 섹션 필드(schema)/제거
- [x] E3 이미지 업로드(툴바) + 드래그 교체(기존 있음) + 자르기

## Wave 2 — 속성 패널 확장 (Demo Act 5)
- [x] P1 슬라이드 배경 (테마/틴트/그라디언트/스포트)
- [x] P2 슬라이드 레이아웃 스위처 (표지/불릿/차트/KPI/이미지/표/섹션)
- [x] P3 Fill 타입 (Solid/Linear/Circular)
- [x] P4 Stroke 두께 (0/1/2/3)
- [x] P5 그림자 Effects 토글
- [x] P6 회전 입력 + 불투명도 슬라이더 입력 + 불투명도 슬라이더
- [x] P7 색 스와치 (테마기본/액센트/레드/그린/앰버)
- [x] P9 차트 데이터 편집 (label/value 행·추가/삭제·합계)

## Wave 3 — 미디어 삽입 (Demo Act 5.5)
- [x] E2a YouTube 임베딩
- [x] E2b Pexels 스톡 이미지
- [x] E2c GIPHY / 아이콘 / 이모지 라이브러리
- [x] E2d AI 이미지 생성 (openai_model 키 준비됨)

## Wave 4 — 생성 플로우 (Demo Act 2·3)
- [x] S1 Setup 화면: 스타일 4카드 (Report/Standard/Presentation/Keynote)
- [x] S2 테마 갤러리 + 변형 A~E + 변형 A~E
- [x] O1 아웃라인 viz 미리보기 블록 (bar/line/pie/kpi/table/image/process)
- [x] O3 표 요소 (viz 이미지는 MediaPicker로 대체) 추가: 이미지·표
- [x] H1 홈 비율 4:3 추가 (16:9/4:5 → +4:3)
- [x] H2 스토리보드 ⤢확대 모달 (11종/트레이 composer는 2차) + ⤢확대 모달 + 트레이 담기/드래그
- [x] H3 Web Scrap URL 모달 (+링크·배지 카운트)
- [x] T1 표 (TableElement·셀편집·행/열) (셀 편집·행 추가/삭제)

## Wave 5 — 협업·발표·내보내기 (Demo Act 6·7)
- [x] V1 버전 히스토리 (저장/복원 스냅샷)
- [x] C1 댓글 탭 (핀은 2차) (댓글 툴·핀·팝오버·답글·해결·댓글 탭)
- [x] C2 협업 커서 + 선택 + 선택 하이라이트 (현재 프레즌스 점만)
- [x] N1 노트 탭 전체 목록 + 점프
- [x] PR1 발표 전환 효과 (slide/fade/zoom) + 미리보기
- [x] X1 PNG 내보내기
- [x] X3 업그레이드 모달 (4플랜 + 비교표) + 내보내기 Plan 잠금

## Wave 6 — 어드민 신규 6페이지 (Admin 시안, 15p)
- [x] AD1 덱·공유 관리
- [x] AD2 스토리보드 템플릿 (템플릿 관리 페이지가 와이어프레임 라이브러리 관리 = 동일)
- [x] AD3 초대·댓글
- [x] AD4 AI 모델 (단가·Free노출·서비스상태)
- [x] AD5 API 키 관리
- [x] AD6 크레딧 사용 내역
- [x] AD7 사용자 관리: 플랜 변경 + 크레딧 리셋
- [x] AD8 대시보드: 테마 사용 비율 도넛

## Wave 7 — 계정계 (Demo Act 0·1, 클라이언트 시뮬레이션) 🔷
- 🔷 A1 로그인/회원가입 화면 (탭·검증·verify·forgot)
- 🔷 A2 OAuth Google/카카오 버튼
- [x] A5 온보딩 마법사 (언어·용도·완료)
- [x] A6 설정 모달 (계정·브랜드킷·기본생성·에디터·데이터)

## Wave 8 — 디자인 모노크롬 v2 (Design 최신 확정) 🔷
- [x] D1 모노크롬 전환 (accent #6D4AFF→#1A1A1A, accent-soft→#F0F0EE)
- 🔷 D2 Material Symbols 아이콘 (글리프 대체)
- [x] D3 선택 핸들 v2 (검정 테두리·흰 코너) v2 (회전·삭제·주핸들)

---
✅ 이미 구현: home 기본·outline 스트리밍·3패널 에디터·기본 도형·pos/align/zorder/lock/opacity/radius/fill·타이포 BIUS·차트 분해·magic edit·재생성 레이어·발표모드(nav)·공유(링크+이메일초대)·협업 프레즌스·PPTX/Figma export·어드민 9p·이메일 OTP
