# 팀 작업 계획

- 팀명: kkirikkiri-dev-youtube-0313
- 목표: 유튜브 트래커 기능 추가 (YouTube 협찬 체크 자동화)
- 생성 시각: 2026-03-13

## 팀 구성
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| team-lead | 팀장 | Opus | 아키텍처 설계 / 태스크 배분 / 코드 리뷰 / 통합 판단 |
| developer-1 | 핵심 개발자 | Opus | YouTube Playwright 크롤러, 노션/슬랙 연동 함수, /api/youtube-tracker 라우트, /api/youtube-tracker-schedule 라우트 |
| developer-2 | 보조 개발자 | Opus | 유튜브 트래커 페이지 UI, 사이드바 메뉴 추가, /api/youtube-tracker-schedule/check 라우트 |

## 프로젝트 컨텍스트
- 프레임워크: Next.js (App Router), Playwright, Supabase, @notionhq/client, @slack/web-api
- 기존 패턴 참고:
  - 크롤러: src/lib/crawler/free-courses.ts (withPage 패턴 사용)
  - API 라우트: src/app/api/free-course-monitor/route.ts (백그라운드 실행 패턴)
  - 스케줄: src/app/api/free-monitor-schedule/route.ts (Supabase youtube_tracker_schedules 테이블)
  - 스케줄 체크: src/app/api/free-monitor-schedule/check/route.ts
  - 노션 함수: src/lib/notion.ts
  - 슬랙 함수: src/lib/slack.ts
  - 페이지 UI: src/app/free-monitor/page.tsx (동일 패턴)
  - 사이드바: src/components/Sidebar.tsx

## 구현할 파일 목록
1. src/lib/crawler/youtube-tracker.ts — YouTube 협찬 체크 크롤러 (Playwright)
2. src/lib/notion.ts — 유튜브 관련 함수 추가 (getYoutubeChannels, getLectureScheduleAll, updateLectureSchedulePage, getScheduleDateForInstructor)
3. src/lib/slack.ts — sendYoutubeTrackerReport 함수 추가
4. src/app/api/youtube-tracker/route.ts — 백그라운드 실행 API
5. src/app/api/youtube-tracker-schedule/route.ts — 스케줄 설정 GET/POST
6. src/app/api/youtube-tracker-schedule/check/route.ts — cron 체크
7. src/app/youtube-tracker/page.tsx — 유튜브 트래커 페이지 UI
8. src/components/Sidebar.tsx — 메뉴 추가

## 노션 DB 정보
- 타사 강의 일정 DB: 2d1b6ef7-b800-805c-abb1-000b145288c7
- 유튜브 강의 협찬 DB: 2d3b6ef7-b800-80cd-a6cd-000b29d50ec5
- 슬랙 채널: C0AJZ18BZKJ

## 협찬 판별 도메인
| 도메인 | 플랫폼 |
|--------|--------|
| moneyupclass.com | 머니업클래스 |
| titanclass.co.kr | 타이탄클래스 |
| ivyclass.co.kr | 아이비클래스 |
| invaderschool.com, invader.co.kr | 인베이더스쿨 |
| cojubu.com, cojooboo.co.kr | 코주부클래스 |
| fitchnic.com | 핏크닉 |
| harvardclass.com | 하버드클래스 |
| nlabclass.com, nlab.kr | N잡연구소 |
| armageddonclass.com | 아마겟돈클래스 |

## 태스크 목록
- [ ] T1: YouTube 크롤러 핵심 로직 구현 → developer-1
- [ ] T2: 노션/슬랙 연동 함수 추가 → developer-1
- [ ] T3: /api/youtube-tracker 라우트 구현 → developer-1
- [ ] T4: /api/youtube-tracker-schedule 라우트 구현 → developer-1
- [ ] T5: 유튜브 트래커 페이지 UI 구현 → developer-2
- [ ] T6: 사이드바 메뉴 추가 → developer-2
- [ ] T7: /api/youtube-tracker-schedule/check 라우트 구현 → developer-2
- [ ] T8: 팀장 코드 리뷰 + 통합 확인 → team-lead

## 주요 결정사항
- Supabase 테이블명: youtube_tracker_schedules (free_monitor_schedules와 동일 구조)
- 크롤러: browser.ts의 withPage 패턴 재사용
- 스케줄 기본값: 매주 화요일(2) 15:30 KST
- 협찬 설명란 추출: shortDescription 방식 (innerHTML 파싱)
- 네이버 단축URL 처리: 판별 불가로 기록
