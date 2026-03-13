import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET: List targets for a date
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');

  let query = supabaseAdmin
    .from('crawl_targets')
    .select('*')
    .order('created_at', { ascending: false });

  if (date) {
    query = query.eq('target_date', date);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    return NextResponse.json({ targets: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ targets: data });
}

// POST: Add a crawl target
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { target_date, platform, instructor, course_title } = body;

  const { data, error } = await supabaseAdmin
    .from('crawl_targets')
    .insert({ target_date, platform, instructor, course_title })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, target: data });
}

// DELETE: Remove a target
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('crawl_targets')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
