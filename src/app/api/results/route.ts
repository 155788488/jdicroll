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

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: 'ids 배열이 필요합니다' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('crawl_results')
      .delete()
      .in('id', ids);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedCount: ids.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
