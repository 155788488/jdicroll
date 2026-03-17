import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

// 수동으로 즉시 크롤링 실행 + Notion 업로드
export async function POST(req: NextRequest) {
  try {
    // Get yesterday's date in KST
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    kst.setDate(kst.getDate() - 1);
    const yesterday = kst.toISOString().split('T')[0];

    // Fetch targets from Notion (or Supabase fallback)
    let targets: { platform: string; instructor: string; courseTitle: string }[] = [];
    if (process.env.NOTION_API_KEY) {
      const { getYesterdayLectures } = await import('@/lib/notion');
      const lectures = await getYesterdayLectures();
      targets = lectures.map(l => ({
        platform: l.platform,
        instructor: l.instructor,
        courseTitle: l.courseTitle,
        url: l.url,
      }));
    }

    if (targets.length === 0) {
      // Fallback: Supabase manual targets
      const { data } = await supabaseAdmin
        .from('crawl_targets')
        .select('*')
        .eq('target_date', yesterday);
      targets = (data || []).map((t: any) => ({
        platform: t.platform,
        instructor: t.instructor,
        courseTitle: t.course_title,
      }));
    }

    if (targets.length === 0) {
      return NextResponse.json({ success: true, message: '크롤링할 강의가 없습니다.', successCount: 0, failCount: 0 });
    }

    // Run crawl
    const { crawlAll } = await import('@/lib/crawler/index');
    const results = await crawlAll(targets);

    // Save to Supabase
    let successCount = 0;
    let failCount = 0;

    for (const r of results) {
      await supabaseAdmin.from('crawl_results').upsert({
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
      }, { onConflict: 'crawl_date,platform,course_title' });

      if (r.status === 'success') successCount++;
      else failCount++;
    }

    // Write to Notion report DB
    if (process.env.NOTION_API_KEY && successCount > 0) {
      const { writeReport } = await import('@/lib/notion');
      const notionResults = results
        .filter(r => r.status === 'success')
        .map(r => ({
          instructor: r.instructor,
          courseTitle: r.courseTitle,
          platform: r.platform,
          date: yesterday,
          optionName: r.optionName || '',
          optionPrice: r.price || 0,
          enrollmentCount: r.enrollmentCount || 0,
        }));
      await writeReport(notionResults);
    }

    // Update last_run_at in schedule
    await supabaseAdmin
      .from('cron_schedules')
      .update({ last_run_at: now.toISOString() })
      .not('id', 'is', null);

    return NextResponse.json({ success: true, successCount, failCount, results, crawlDate: yesterday });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
