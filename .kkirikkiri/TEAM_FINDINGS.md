# 발견 사항 & 공유 자료

## 2026-03-13 — team-lead: 프로젝트 구조 파악

### 기존 코드 패턴 (반드시 따를 것)

**백그라운드 실행 API 패턴** (src/app/api/free-course-monitor/route.ts 참고):
- 전역 jobState 객체로 상태 관리
- POST → 즉시 { started: true } 반환 후 백그라운드 실행
- GET → 현재 상태 반환
- alreadyRunning 체크 필수

**스케줄 API 패턴** (src/app/api/free-monitor-schedule/route.ts 참고):
- Supabase 테이블에서 단일 행 관리
- GET: 조회, POST: upsert

**스케줄 체크 패턴** (src/app/api/free-monitor-schedule/check/route.ts 참고):
- Authorization: Bearer {CRON_SECRET} 헤더 검증
- KST 시각 비교로 실행 여부 결정
- last_run_at으로 중복 실행 방지

**크롤러 패턴** (src/lib/crawler/free-courses.ts 참고):
- withPage(async (page) => {...}) 패턴 사용
- onProgress callback으로 로그 전달

**노션 API 직접 호출** (src/lib/notion.ts 참고):
- @notionhq/client 호환성 문제로 fetch로 직접 호출
- notionRequest 헬퍼 함수 사용 가능
- FREE_COURSE_DB_ID = '2d1b6ef7-b800-8069-8792-e103d12f9a4f' (이미 존재)

**프론트엔드 UI 패턴** (src/app/free-monitor/page.tsx 참고):
- 폴링으로 진행상황 실시간 표시 (1500ms 간격)
- 로그 터미널 스타일 (bg-gray-900)
- 설정 패널 오버레이 (우측 슬라이드)
- 스케줄 설정 내장

### 중요한 주의사항
- Notion DB ID에 하이픈이 있거나 없는 버전 혼용 주의
- 슬랙 FREE_COURSE_CHANNEL_ID = 'C0AJ2LQ479U' (기존 채널)
- YouTube 트래커 슬랙 채널: C0AJZ18BZKJ (별도)
- Supabase 테이블 youtube_tracker_schedules 생성 필요 (free_monitor_schedules와 동일 구조)

---

# DEAD_ENDS (시도했으나 실패한 접근)

(현재 없음)
