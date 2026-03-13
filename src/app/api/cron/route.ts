import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Trigger the crawl
  const crawlUrl = new URL('/api/crawl', req.url);
  const response = await fetch(crawlUrl, { method: 'POST' });
  const data = await response.json();

  // If Notion integration is configured, sync results
  if (process.env.NOTION_API_KEY && data.results?.length > 0) {
    try {
      const { writeReport } = await import('@/lib/notion');
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      kst.setDate(kst.getDate() - 1);
      const yesterday = kst.toISOString().split('T')[0];
      const notionResults = data.results
        .filter((r: any) => r.status === 'success')
        .map((r: any) => ({
          instructor: r.instructor,
          courseTitle: r.courseTitle,
          platform: r.platform,
          date: yesterday,
          optionName: r.optionName || '',
          optionPrice: r.price || 0,
          enrollmentCount: r.enrollmentCount || 0,
        }));
      await writeReport(notionResults);
    } catch (e) {
      console.error('Notion sync failed:', e);
    }
  }

  // If Slack integration is configured, send report
  if (process.env.SLACK_BOT_TOKEN) {
    try {
      const { sendDailyReport } = await import('@/lib/slack');
      // TODO: Transform and send to Slack when connected
    } catch (e) {
      console.error('Slack notification failed:', e);
    }
  }

  return NextResponse.json(data);
}
