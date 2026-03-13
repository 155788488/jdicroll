import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');

  let query = supabaseAdmin
    .from('crawl_results')
    .select('*')
    .order('created_at', { ascending: false });

  if (date) {
    query = query.eq('crawl_date', date);
  } else {
    query = query.limit(50);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ results: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ results: data });
}
