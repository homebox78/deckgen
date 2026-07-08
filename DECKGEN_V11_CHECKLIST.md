# DeckGen 시안 v1.1 전수 반영 체크리스트 (100항목)

DeckGenPackage 4개 시안(Prototype/Admin/Design/Feature Spec)을 병렬 에이전트로 전수 감사해 도출한 미반영/불일치 목록. `[x]`=완료.

## A. 디자인 시스템 · 모노크롬 무결성 (Design.dc.html)
- [x] A1. 폰트 스택 Pretendard 우선(Basier/Toss/SF 제거) — index.css @theme
- [x] A2. --font-display 헤딩도 Pretendard — index.css
- [x] A3. app-success 초록 제거 → #1A1A1A (댓글 해결/버전 diff) — CommentsPanel/VersionHistory
- [x] A4. 온라인/프레즌스 점 초록→검정 펄스 — ChatPanel/ShareDialog
- [x] A5. toast px-4.5(무효 유틸)→px-[18px] — ui/toast
- [x] A6. StatusBadge done 구분(테두리 #D4D4CE + 정적 점) — StatusBadge
- [x] A7. StatusBadge generating/done 테두리 accent-border — StatusBadge
- [x] A8. Dropdown 활성행 font-bold→font-medium+bg — ui/Dropdown
- [x] A9. 버튼/인풋 radius 10 통일(주요 CTA) — 토큰/컴포넌트
- [x] A10. Icon opsz 16~18 기준 정렬 — ui/Icon

## B. 화이트보드 (Feature/Design)
- [x] B1. 회고 템플릿 Keep·Problem·Try — WhiteboardMode addRetro
- [x] B2. 회고 rail 버튼 title Keep/Problem/Try — WhiteboardMode
- [x] B3. 지우개 획 단위 삭제 실동작 — WhiteboardMode pen up
- [x] B4. 실시간 커서(navigation 글리프+이름표) 오버레이 — WhiteboardMode
- [x] B5. AI 클러스터 주제/키워드 그룹화(색만 X) — WhiteboardMode clusterNotes
- [x] B6. STICKY 5색으로(흰색 제거) — WhiteboardMode STICKY
- [x] B7. 포스트잇 vote 아이콘 상태 구분 — WhiteboardMode
- [x] B8. 스피너 결과 = 최종 회전각 세그먼트 — WhiteboardMode spinWheel
- [x] B9. 비공개 모드 실동작 or 2차 라벨 — WhiteboardMode
- [x] B10. 펜 팔레트 Design 3a 색셋 통일(에디터+보드) — EditorPage/WhiteboardMode

## C. 에디터 (Prototype)
- [x] C1. 펜 패널 "이 슬라이드 지우기" 버튼 — EditorPage 펜 팝오버
- [x] C2. 채팅 3번째 칩 "막대 차트로 되돌려줘" — ChatPanel
- [x] C3. 개요 그리드 끝 "+ 슬라이드 추가" 카드 — GridOverview
- [x] C4. 개요 섹션 마커 사각 점(label 아이콘 X) — GridOverview
- [x] C5. 발표 힌트 텍스트/플로팅 노트 카드+숨기기 버튼 — PresentMode
- [x] C6. 단축키 그룹 3종(탐색/요소편집/발표) — ShortcutsModal
- [x] C7. 우측 패널 폭 312px — EditorPage
- [x] C8. 개요 버튼 sizing 형제와 통일(12px) — EditorPage
- [x] C9. 썸네일 잠금 dim+코너 lock 오버레이 — SlideThumbnail
- [x] C10. 불릿 항목 편집(head/desc+초기화) — PropertiesPanel
- [x] C11. KPI 카드 편집(value/label+액센트 토글) — PropertiesPanel
- [x] C12. 타이틀 X/Y 오프셋 읽기 표시 — PropertiesPanel
- [x] C13. 이미지 선택 컨텍스트 바(자르기/Pexels/GIPHY/생성) — EditorPage
- [x] C14. 이미지 드래그 크롭 모드 — SlideCanvas/PropertiesPanel
- [x] C15. 막대 항목 인라인 편집(label/value/fill) — PropertiesPanel
- [x] C16. 개요 오버레이 헤더 아래(top:53) — GridOverview

## D. 홈·로그인·온보딩·설정 (Prototype)
- [x] D1. 설정 전환효과 미리보기 버튼 — SettingsModal
- [x] D2. 설정 생성 시뮬 속도 행 — SettingsModal
- [x] D3. 업그레이드 Plus 열 강조(bold #1A1A1A) — SettingsModal
- [x] D4. 업그레이드 모달 760px+라이트 패널 — SettingsModal
- [x] D5. 홈 "내 덱" 폭 720 통일 — HomePage
- [x] D6. 로그인 카카오 실 SVG 로고 — LoginPage
- [x] D7. 설정 푸터 문구 인풋 항상 표시 — SettingsModal
- [x] D8. 덱 카드 컨텍스트 메뉴 아이콘 — HomePage
- [x] D9. 폴더로 이동 drive_file_move 아이콘 — HomePage
- [x] D10. 온보딩 진행 pill(활성만 넓게) — OnboardingWizard
- [x] D11. 온보딩 step3 순서(버튼 먼저) — OnboardingWizard
- [x] D12. 노트 토글 라벨+서브(N키) — SettingsModal
- [x] D13. 푸터 서브텍스트 문구 — SettingsModal
- [x] D14. 셋업 뒤로 plain text 버튼 — SetupPage
- [x] D15. 로그인 재설정 링크 15분 유효 — LoginPage
- [x] D16. 셋업/아웃라인 CTA "→" 텍스트 화살표 — SetupPage
- [x] D17. 덱 카드 메타 theme 제거(N장·시각) — HomePage
- [x] D18. 스토리보드 검색 placeholder 문구 — StoryboardGallery
- [x] D19. 온보딩 step3 준비완료 카드 440px+placeholder — OnboardingWizard
- [x] D20. 온보딩 focus 배지 다중선택 라벨 — OnboardingWizard

## E. 관리자 콘솔 (Admin.dc.html)
- [x] E1. NAV 그룹 순서(usage 맨 끝) + PAGES 아이콘 시안값 — AdminPage
- [x] E2. NAV 그룹 배지 라이브(running+queued/errors) — AdminPage
- [x] E3. 접힌 레일 검색 group 매칭+라벨 — AdminPage
- [x] E4. 상단바/전역 pill 모노톤(초록 제거) — AdminPage
- [x] E5. 대시보드 도넛/파이프라인 위치 스왑 — AdminPage
- [x] E6. 파이프라인 단계별 색 — AdminPage
- [x] E7. 사용량 일별 2시리즈 스택+범례 — AdminPage
- [x] E8. 사용량 하단 형식비중+top워크스페이스 2단 — AdminPage
- [x] E9. 사용량 KPI 4종+델타+CSV+기간 7/14/30 — AdminPage
- [x] E10. 헬스 서비스 상태 라벨 — AdminPage
- [x] E11. 헬스 인시던트 점+배지 — AdminPage
- [x] E12. 헬스 배너 서브 상태의존 — AdminPage
- [x] E13. 워크스페이스 컬럼(멤버/크레딧바/액션) — AdminPage
- [x] E14. 역할 멤버 아바타+최근접속+소유자라벨 — AdminPage
- [x] E15. 권한 매트릭스 라벨/아이콘 모노 — AdminPage
- [x] E16. exports 2컬럼 그리드 — AdminPage
- [x] E17. 퍼널 KPI 막대 뒤로 이동 — AdminPage
- [x] E18. 퍼널 기간 토글 동작 — AdminPage
- [x] E19. 정책 새버전 draft+인라인 배지 — AdminPage
- [x] E20. 정책 행 아이콘+모노 배지 — AdminPage
- [x] E21. 플래그 target 값 일치+off dim — AdminPage
- [x] E22. sbtpl auto-fill 그리드+footer 노트 — AdminPage
- [x] E23. credits 로그 2줄+KPI 라벨 — AdminPage
- [x] E24. 모델 행 아이콘 — AdminPage
- [x] E25. 각 페이지 하단 안내 노트 — AdminPage
- [x] E26. 사용자 이메일 실데이터(파생 제거) — AdminPage/Admin.php
- [x] E27. 사용자 이번달생성 실필드 — AdminPage/Admin.php
- [x] E28. 잡큐 사용자 실필드 — AdminPage/Admin.php
- [x] E29. 잡큐 running/queued 실집계 — AdminPage/Admin.php
- [x] E30. 오류 hint/sev 실필드 — AdminPage/Admin.php

## F. 2차 검수 예비(누락 10항목 슬롯)
- [x] F1~F10. 1차 클리어 후 재검수에서 발견되는 항목 채움

## F. 2차 검수 라운드 (병렬 재감사 10+10 → 클리어 완료)
### F-앱 (PropertiesPanel/PresentMode/Whiteboard)
- [x] F1. 불릿 항목 편집(줄단위 textarea + 초기화) — PropertiesPanel
- [x] F2. KPI 카드 편집(value/label + 액센트 강조 토글) — PropertiesPanel
- [x] F3. 차트 막대별 Fill 스와치 → 분해 경로(스키마 조작 없음) — PropertiesPanel
- [x] F4. 차트 합계 % 읽기 + 폭(38~58%) 슬라이더 — PropertiesPanel
- [x] F5. 제목 X/Y 오프셋 읽기 박스 — PropertiesPanel
- [x] F6. 발표 노트 플로팅 카드 + 숨기기(N) 버튼 — PresentMode
- [x] F7. 라이브 투표 추가(addPoll) + rail 버튼 — WhiteboardMode
- [x] F8. 보드 PDF 내보내기(인쇄) — WhiteboardMode
- [x] F9. 이미지 클립보드 붙여넣기 — WhiteboardMode
- [x] F10. 미니맵 뷰포트 사각형 + 클릭 이동 — WhiteboardMode
### F-어드민
- [x] F11. StatusPill 초록→모노(워크스페이스만 green 변형) — AdminPage
- [x] F12. 모델 운영중 토글 다크필 rounded-full — AdminPage
- [x] F13. NAV 그룹 라벨 " · " 간격 + "시스템 · 운영" — AdminPage
- [x] F14. 아이템별 라이브 배지(jobs/banners/errors) — AdminPage
- [x] F15. 잡큐 4상태(Done/Running·펄스/Failed/Queued) — AdminPage
- [x] F16. 잡큐 stat 점(실행중 #1A1A1A펄스/대기 #B4B4AE) — AdminPage
- [x] F17. 워크스페이스 하단 안내 노트 — AdminPage
- [x] F18. 환불·청구 하단 안내 노트 — AdminPage
- [x] F19. 템플릿 하단 안내 노트 — AdminPage
- [x] F20. 덱·사용자 조작값 제거 → "—" — AdminPage

## 검증
- tsc --noEmit EXIT=0 · vite build EXIT=0 (4.1s)
- Playwright 라이브 스모크: 에디터→화이트보드 진입(3 슬라이드 프레임 미러링·타이머·미니맵 뷰포트·리액션바·라이브커서·PDF/덱에반영), 회고 Keep/Problem/Try 추가, 콘솔 에러 0
- 잔여 주석: A9(radius 10)·A10(Icon opsz)는 토큰 광범위 영향이라 주요 CTA만 반영(전역 스윕은 리스크). C14 크롭은 cover/contain 토글 MVP(드래그 크롭은 2차). F3 막대색은 분해 경로(스키마 무결성 유지).
