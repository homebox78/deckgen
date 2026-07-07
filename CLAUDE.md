# DeckGen

AI 프레젠테이션 생성 도구 MVP. 단일 소스 문서는 @DECKGEN_SPEC.md — 구현 전 반드시 읽고, Phase 완료 기준 통과 후 다음 단계 진행.

## 실행
- `npm run dev` → client(5173) + server(3001) 동시 실행
- **키 관리 단일 소스 = `server/config/config.php`** (git 제외) — DB·클로드 API 키(`anthropic_api_key`)·SMTP 등 전부 여기서. Node 서버(src/config.ts 로더)·PHP 서버(Db::cfg) 둘 다 이 파일을 읽고, 환경변수(.env)가 있으면 그쪽 우선. 키가 비면 모의(mock) 응답 모드로 동작

## 구조 요약
- `client/src/engine/` — DeckSchema(§3) 기준: layout.ts(좌표 계산) → fabricRenderer.ts(렌더) → fabricSync.ts(역동기화) → pptxExporter.ts(내보내기)
- `server/src/ai/` — 프롬프트·zod 검증·JSON 강제(1회 재시도)
- 원칙: Schema(JSON)가 단일 원본. Fabric 객체/DOM이 원본이 되면 안 됨. LLM은 좌표를 찍지 않음(레이아웃 엔진 담당).

## Personal Context Library
@mydev/CLAUDE.md
