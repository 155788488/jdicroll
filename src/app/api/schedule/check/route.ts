import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

// 외부 cron 서비스(cron-job.org 등)에서 1분마다 호출
// DB에 저장된 스케줄과 현재 시간 비교 후 실행
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: schedule } = await supabaseAdmin
    .from('cron_schedules')
    .select('*')
    .limit(1)
    .single();

  if (!schedule || !schedule.enabled) {
    return NextResponse.json({ skipped: true, reason: 'Schedule disabled or not configured' });
  }

  // Current KST time
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentHour = kst.getUTCHours();
  const currentMinute = kst.getUTCMinutes();
  const currentDay = kst.getUTCDay(); // 0=Sun, 1=Mon, ...
  const todayKST = kst.toISOString().split('T')[0];

  // Check time match
  if (currentHour !== schedule.hour || currentMinute !== schedule.minute) {
    return NextResponse.json({ skipped: true, reason: 'Not scheduled time' });
  }

  // Check day of week for weekly schedules
  if (schedule.frequency === 'weekly' && !schedule.days_of_week.includes(currentDay)) {
    return NextResponse.json({ skipped: true, reason: 'Not scheduled day' });
  }

  // Check if already ran today
  if (schedule.last_run_at) {
    const lastRunKST = new Date(new Date(schedule.last_run_at).getTime() + 9 * 60 * 60 * 1000);
    const lastRunDate = lastRunKST.toISOString().split('T')[0];
    if (lastRunDate === todayKST) {
      return NextResponse.json({ skipped: true, reason: 'Already ran today' });
    }
  }

  // Trigger the run
  const runUrl = new URL('/api/schedule/run', req.url);
  const response = await fetch(runUrl, { method: 'POST' });
  const data = await response.json();

  return NextResponse.json({ triggered: true, ...data });
}
