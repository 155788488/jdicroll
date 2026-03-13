import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('crawl_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ logs: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data });
}
