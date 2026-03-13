import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

// cron-job.org에서 1분마다 호출
// Authorization: Bearer {CRON_SECRET}
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: schedule } = await supabaseAdmin
    .from('free_monitor_schedules')
    .select('*')
    .limit(1)
    .single();

  if (!schedule || !schedule.enabled) {
    return NextResponse.json({ skipped: true, reason: 'Schedule disabled or not configured' });
  }

  // 현재 KST 시각
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentHour = kst.getUTCHours();
  const currentMinute = kst.getUTCMinutes();
  const currentDay = kst.getUTCDay();
  const todayKST = kst.toISOString().split('T')[0];

  if (currentHour !== schedule.hour || currentMinute !== schedule.minute) {
    return NextResponse.json({ skipped: true, reason: 'Not scheduled time' });
  }

  if (schedule.frequency === 'weekly' && !schedule.days_of_week.includes(currentDay)) {
    return NextResponse.json({ skipped: true, reason: 'Not scheduled day' });
  }

  if (schedule.last_run_at) {
    const lastRunKST = new Date(new Date(schedule.last_run_at).getTime() + 9 * 60 * 60 * 1000);
    const lastRunDate = lastRunKST.toISOString().split('T')[0];
    if (lastRunDate === todayKST) {
      return NextResponse.json({ skipped: true, reason: 'Already ran today' });
    }
  }

  // last_run_at 업데이트 (중복 실행 방지)
  await supabaseAdmin
    .from('free_monitor_schedules')
    .update({ last_run_at: now.toISOString() })
    .not('id', 'is', null);

  // 모니터링 시작 요청
  const runUrl = new URL('/api/free-course-monitor', req.url);
  const startRes = await fetch(runUrl, { method: 'POST' });
  const startData = await startRes.json();

  if (startData.alreadyRunning) {
    return NextResponse.json({ triggered: false, reason: 'Already running', runAt: now.toISOString() });
  }

  // 완료까지 폴링 (최대 270초)
  const deadline = Date.now() + 270_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const statusRes = await fetch(runUrl, { method: 'GET' });
    const status = await statusRes.json();
    if (!status.running) break;
  }

  return NextResponse.json({ triggered: true, runAt: now.toISOString() });
}
