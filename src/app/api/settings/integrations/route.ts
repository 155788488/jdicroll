import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    notion: !!process.env.NOTION_API_KEY,
    slack: !!process.env.SLACK_BOT_TOKEN,
  });
}
