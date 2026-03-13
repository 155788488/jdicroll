Always respond in Korean. 모든 응답과 질문은 반드시 한국어로 해주세요.

작업하면서 모르는 건 최선의 판단으로 결정하고, 완료될 때까지 멈추지 말고 계속 진행해줘

## MCP 활용 원칙

- **Notion MCP** (`mcp__claude_ai_Notion__*`) — 노션 DB 조회/생성/수정 시 사용
- **Slack MCP** (`mcp__claude_ai_Slack__*`) — 슬랙 메시지 전송 시 사용
- **Context7 MCP** (`mcp__context7__*`) — 라이브러리 최신 문서 필요할 때 사용
- 복잡한 병렬 작업은 `/kkirikkiri`로 팀 구성

## 프로젝트 개요

Next.js + Playwright 크롤러. 유료 강의 플랫폼 결제 건수 자동 수집.
노션 '타사 강의 일정' DB → 크롤링 → 노션 '강의 전환 리포트' DB 업로드.
Railway(Docker) 배포 예정 (현재 로컬 개발 중). Vercel 불가 (Playwright).

## 주요 사항

- 스케줄 자동실행은 Railway 배포 + cron-job.org 연결 후 가능 (로컬 불가)
- Windows 로컬에서 Playwright는 시스템 Chrome → Edge → 번들 Chromium 순으로 시도
- `/api/crawl-url` — Supabase + 노션 리포트 동시 저장
- CRON_SECRET은 `/api/schedule/check` Authorization Bearer 헤더로 전달
