import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
}

// Lazy-initialized clients
let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

// Client-side Supabase client
export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return _supabase;
}

// Server-side Supabase client with service role
export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    _supabaseAdmin = createClient(getSupabaseUrl(), serviceKey || getSupabaseAnonKey());
  }
  return _supabaseAdmin;
}

// Backward compat exports
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseAdmin() as any)[prop];
  },
});

export interface PlatformCredential {
  id: string;
  platform: string;
  login_type: 'email' | 'kakao' | 'google';
  email?: string;
  password?: string;
  cookies?: string;
  created_at: string;
  updated_at: string;
}

export async function getCredential(platform: string): Promise<PlatformCredential | null> {
  const { data, error } = await supabaseAdmin
    .from('platform_credentials')
    .select('*')
    .eq('platform', platform)
    .single();

  if (error) {
    console.error(`Failed to get credential for ${platform}:`, error);
    return null;
  }
  return data;
}

export async function saveCredential(credential: Omit<PlatformCredential, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabaseAdmin
    .from('platform_credentials')
    .upsert(credential, { onConflict: 'platform' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Supabase SQL for creating the tables:
//
// CREATE TABLE platform_credentials (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   platform TEXT UNIQUE NOT NULL,
//   login_type TEXT NOT NULL DEFAULT 'email',
//   email TEXT,
//   password TEXT,
//   cookies TEXT,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   updated_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// CREATE TABLE crawl_results (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   crawl_date DATE NOT NULL,
//   platform TEXT NOT NULL,
//   instructor TEXT NOT NULL,
//   course_title TEXT NOT NULL,
//   enrollment_count INTEGER,
//   price INTEGER,
//   option_name TEXT DEFAULT '얼리버드',
//   estimated_revenue BIGINT,
//   status TEXT DEFAULT 'success',
//   error_message TEXT,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE(crawl_date, platform, course_title)
// );
//
// CREATE TABLE crawl_logs (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   crawl_date DATE NOT NULL,
//   started_at TIMESTAMPTZ DEFAULT NOW(),
//   completed_at TIMESTAMPTZ,
//   total_platforms INTEGER,
//   success_count INTEGER DEFAULT 0,
//   fail_count INTEGER DEFAULT 0,
//   status TEXT DEFAULT 'running',
//   report_sent BOOLEAN DEFAULT FALSE,
//   slack_sent BOOLEAN DEFAULT FALSE,
//   notion_sent BOOLEAN DEFAULT FALSE
// );
