import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300; // 5 minutes for Railway

export async function POST(req: NextRequest) {
  try {
    // Get yesterday's date in KST
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    kst.setDate(kst.getDate() - 1);
    const yesterday = kst.toISOString().split('T')[0];

    // Create crawl log
    const { data: log, error: logError } = await supabaseAdmin
      .from('crawl_logs')
      .insert({
        crawl_date: yesterday,
        status: 'running',
        total_platforms: 0,
      })
      .select()
      .single();

    if (logError) {
      return NextResponse.json({ success: false, error: logError.message }, { status: 500 });
    }

    // Import crawler dynamically to avoid bundling playwright in client
    const { crawlAll } = await import('@/lib/crawler/index');

    // Fetch targets: Notion if configured, otherwise Supabase manual entry
    let targets: { platform: string; instructor: string; courseTitle: string }[] = [];
    if (process.env.NOTION_API_KEY) {
      const { getYesterdayLectures } = await import('@/lib/notion');
      const lectures = await getYesterdayLectures();
      targets = lectures.map(l => ({
        platform: l.platform,
        instructor: l.instructor,
        courseTitle: l.courseTitle,
      }));
    }
    if (targets.length === 0) {
      targets = await getTargetsFromSupabase(yesterday);
    }

    if (targets.length === 0) {
      await supabaseAdmin
        .from('crawl_logs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          total_platforms: 0,
          success_count: 0,
          fail_count: 0,
        })
        .eq('id', log.id);

      return NextResponse.json({
        success: true,
        message: '오늘 크롤링할 강의가 없습니다.',
        successCount: 0,
        failCount: 0,
      });
    }

    const results = await crawlAll(targets);

    // Save results to Supabase
    let successCount = 0;
    let failCount = 0;

    for (const r of results) {
      const { error } = await supabaseAdmin.from('crawl_results').upsert({
        crawl_date: yesterday,
        platform: r.platform,
        instructor: r.instructor,
        course_title: r.courseTitle,
        enrollment_count: r.enrollmentCount,
        price: r.price,
        option_name: r.optionName,
        estimated_revenue: r.estimatedRevenue,
        status: r.status,
        error_message: r.errorMessage || null,
      }, {
        onConflict: 'crawl_date,platform,course_title',
      });

      if (r.status === 'success') successCount++;
      else failCount++;
    }

    // Update crawl log
    await supabaseAdmin
      .from('crawl_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_platforms: results.length,
        success_count: successCount,
        fail_count: failCount,
      })
      .eq('id', log.id);

    return NextResponse.json({
      success: true,
      successCount,
      failCount,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Temporary: get targets from Supabase manual entry
// Later: replace with Notion integration
async function getTargetsFromSupabase(date: string) {
  const { data } = await supabaseAdmin
    .from('crawl_targets')
    .select('*')
    .eq('target_date', date);

  return (data || []).map((t: any) => ({
    platform: t.platform,
    instructor: t.instructor,
    courseTitle: t.course_title,
  }));
}
