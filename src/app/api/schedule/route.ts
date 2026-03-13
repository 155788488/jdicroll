import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data } = await supabaseAdmin
    .from('cron_schedules')
    .select('*')
    .limit(1)
    .single();

  if (!data) {
    return NextResponse.json({
      enabled: false,
      frequency: 'daily',
      days_of_week: [1, 2, 3, 4, 5],
      hour: 9,
      minute: 0,
      last_run_at: null,
    });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { enabled, frequency, days_of_week, hour, minute } = await req.json();

  const { data: existing } = await supabaseAdmin
    .from('cron_schedules')
    .select('id')
    .limit(1)
    .single();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('cron_schedules')
      .update({ enabled, frequency, days_of_week, hour, minute, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, schedule: data });
  } else {
    const { data, error } = await supabaseAdmin
      .from('cron_schedules')
      .insert({ enabled, frequency, days_of_week, hour, minute })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, schedule: data });
  }
}
