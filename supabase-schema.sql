-- Daily Lecture Tracker - Supabase 테이블 생성 SQL
-- Supabase 대시보드 > SQL Editor에서 실행하세요

-- 1. 플랫폼 로그인 자격증명 테이블
CREATE TABLE IF NOT EXISTS platform_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT UNIQUE NOT NULL,
  login_type TEXT NOT NULL DEFAULT 'email',
  email TEXT,
  password TEXT,
  cookies TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 크롤링 대상 (노션 연동 전 수동 입력용)
CREATE TABLE IF NOT EXISTS crawl_targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_date DATE NOT NULL,
  platform TEXT NOT NULL,
  instructor TEXT NOT NULL,
  course_title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(target_date, platform, course_title)
);

-- 3. 크롤링 결과
CREATE TABLE IF NOT EXISTS crawl_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crawl_date DATE NOT NULL,
  platform TEXT NOT NULL,
  instructor TEXT NOT NULL,
  course_title TEXT NOT NULL,
  enrollment_count INTEGER,
  price INTEGER,
  option_name TEXT DEFAULT '얼리버드',
  estimated_revenue BIGINT,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(crawl_date, platform, course_title)
);

-- 4. 크롤링 실행 로그
CREATE TABLE IF NOT EXISTS crawl_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crawl_date DATE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_platforms INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  report_sent BOOLEAN DEFAULT FALSE,
  slack_sent BOOLEAN DEFAULT FALSE,
  notion_sent BOOLEAN DEFAULT FALSE
);

-- 5. 자동 실행 스케줄 설정
CREATE TABLE IF NOT EXISTS cron_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN DEFAULT FALSE,
  frequency TEXT DEFAULT 'daily', -- 'daily' or 'weekly'
  days_of_week INTEGER[] DEFAULT '{}', -- 0=일, 1=월, ..., 6=토 (weekly일 때만 사용)
  hour INTEGER DEFAULT 9,  -- KST 시
  minute INTEGER DEFAULT 0, -- KST 분
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 무료강의 모니터링 스케줄
CREATE TABLE IF NOT EXISTS free_monitor_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN DEFAULT FALSE,
  frequency TEXT DEFAULT 'daily',
  days_of_week INTEGER[] DEFAULT '{1,2,3,4,5}',
  hour INTEGER DEFAULT 9,
  minute INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 유튜브 트래커 스케줄
CREATE TABLE IF NOT EXISTS youtube_tracker_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN DEFAULT FALSE,
  frequency TEXT DEFAULT 'weekly',
  days_of_week INTEGER[] DEFAULT '{2}',
  hour INTEGER DEFAULT 15,
  minute INTEGER DEFAULT 30,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책 (필요시 활성화)
-- ALTER TABLE platform_credentials ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE crawl_targets ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE crawl_results ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE crawl_logs ENABLE ROW LEVEL SECURITY;
