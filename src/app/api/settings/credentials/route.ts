import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('platform_credentials')
    .select('platform, login_type, email')
    .order('platform');

  if (error) {
    return NextResponse.json({ credentials: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ credentials: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { platform, login_type, email, password } = body;

  if (!platform) {
    return NextResponse.json({ success: false, error: 'Platform is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('platform_credentials')
    .upsert({
      platform,
      login_type: login_type || 'kakao',
      email: email || null,
      password: password || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform' });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
