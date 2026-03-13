import { withPage } from './browser';
import { Page } from 'playwright';

export interface YoutubeSponsored {
  channelName: string;
  channelUrl: string;
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  platform: string;
  sponsorUrl: string;
  sponsorPageText: string; // 협찬 페이지 전체 텍스트 (강사명 매칭용)
  isUnresolvable: boolean;
}

export type ProgressCallback = (msg: string) => void;

const SPONSOR_DOMAINS: Array<{ domains: string[]; koreanNames: string[]; platform: string }> = [
  { domains: ['moneyupclass.com'], koreanNames: ['머니업클래스', '머니업'], platform: '머니업클래스' },
  { domains: ['titanclass.co.kr'], koreanNames: ['타이탄클래스', '타이탄'], platform: '타이탄클래스' },
  { domains: ['ivyclass.co.kr'], koreanNames: ['아이비클래스', '아이비클래스'], platform: '아이비클래스' },
  { domains: ['invaderschool.com', 'invader.co.kr'], koreanNames: ['인베이더스쿨', '인베이더'], platform: '인베이더스쿨' },
  { domains: ['cojubu.com', 'cojooboo.co.kr'], koreanNames: ['코주부클래스', '코주부'], platform: '코주부클래스' },
  { domains: ['fitchnic.com'], koreanNames: ['핏크닉'], platform: '핏크닉' },
  { domains: ['harvardclass.com'], koreanNames: ['하버드클래스', '하버드'], platform: '하버드클래스' },
  { domains: ['nlabclass.com', 'nlab.kr'], koreanNames: ['N잡연구소', 'n잡연구소', 'N잡'], platform: 'N잡연구소' },
  { domains: ['armageddonclass.com'], koreanNames: ['아마겟돈클래스', '아마겟돈'], platform: '아마겟돈클래스' },
  { domains: ['부업의정석.com', 'bueop.com'], koreanNames: ['부업의정석'], platform: '부업의정석' },
];

function isWithin7Days(dateText: string | undefined): boolean {
  if (!dateText) return false;

  // 'N시간 전', 'N분 전' → 항상 포함
  if (/\d+\s*시간\s*전/.test(dateText) || /\d+\s*분\s*전/.test(dateText)) return true;

  // 'N일 전' → 1~7일만 대상
  const dayMatch = dateText.match(/(\d+)\s*일\s*전/);
  if (dayMatch) {
    const days = parseInt(dayMatch[1]);
    return days >= 1 && days <= 7;
  }

  // 'N주 전' 이상이면 스킵
  return false;
}

function matchSponsorDomain(text: string): { platform: string; sponsorUrl: string } | null {
  for (const { domains, platform } of SPONSOR_DOMAINS) {
    for (const domain of domains) {
      const idx = text.indexOf(domain);
      if (idx >= 0) {
        const before = text.lastIndexOf('http', idx);
        if (before >= 0) {
          const urlEnd = text.substring(before).search(/[\s"'<>]/);
          const url = urlEnd > 0 ? text.substring(before, before + urlEnd) : text.substring(before, before + 300);
          return { platform, sponsorUrl: url };
        }
        return { platform, sponsorUrl: domain };
      }
    }
  }
  return null;
}

/** Naver 페이지처럼 도메인 없이 한국어 이름만 있는 경우 플랫폼 식별 */
function matchPlatformByKoreanName(text: string): string | null {
  for (const { koreanNames, platform } of SPONSOR_DOMAINS) {
    for (const name of koreanNames) {
      if (text.includes(name)) return platform;
    }
  }
  return null;
}

function hasNaverShortUrl(text: string): boolean {
  return text.includes('m.site.naver.com');
}

function extractNaverShortUrl(text: string): string | null {
  // m.site.naver.com/... URL 추출
  const match = text.match(/https?:\/\/m\.site\.naver\.com\/[^\s"'<>\\]+/);
  return match ? match[0] : null;
}

async function resolveNaverShortUrl(
  page: Page,
  naverUrl: string
): Promise<{ platform: string; sponsorUrl: string; pageText: string } | null> {
  try {
    await page.goto(naverUrl, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);

    const finalUrl = page.url();

    // 페이지 전체 데이터 한 번에 수집
    const pageData = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
      const bodyText = document.body?.innerText || '';

      const attrs = ['href', 'src', 'data-url', 'data-href', 'data-link', 'action', 'onclick'];
      const links: string[] = [];
      for (const attr of attrs) {
        document.querySelectorAll(`[${attr}]`).forEach(el => {
          const val = el.getAttribute(attr);
          if (val) links.push(val);
        });
      }
      const fullHtml = document.documentElement.innerHTML;

      return {
        pageText: [ogTitle, ogDesc, bodyText].join('\n'),
        linksText: links.join('\n'),
        fullHtml,
      };
    });

    const pageText = pageData.pageText;

    // 1. 최종 리다이렉트 URL에서 도메인 매칭
    const urlMatch = matchSponsorDomain(finalUrl);
    if (urlMatch) return { ...urlMatch, pageText };

    // 2. href/onclick 속성에서 도메인 매칭
    const linkMatch = matchSponsorDomain(pageData.linksText);
    if (linkMatch) return { ...linkMatch, pageText };

    // 3. 전체 HTML에서 도메인 매칭
    const htmlMatch = matchSponsorDomain(pageData.fullHtml);
    if (htmlMatch) return { platform: htmlMatch.platform, sponsorUrl: finalUrl || naverUrl, pageText };

    // 4. 한국어 플랫폼명으로 매칭 (도메인 없이 "하버드클래스" 텍스트만 있는 경우)
    const koreanPlatform = matchPlatformByKoreanName(pageText) || matchPlatformByKoreanName(pageData.fullHtml);
    if (koreanPlatform) {
      return { platform: koreanPlatform, sponsorUrl: finalUrl || naverUrl, pageText };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 협찬 강의 페이지에 접속하여 강사명 추출에 필요한 모든 텍스트를 수집한다.
 * - og 메타태그, JSON-LD 구조화 데이터, 제목 태그, 이미지 alt, 본문 텍스트 포함
 */
async function fetchSponsorPageText(page: Page, url: string): Promise<string> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(1500);

    const text = await page.evaluate(() => {
      const parts: string[] = [];

      // 1. og 메타태그 (제목·설명에 강사명 포함되는 경우 많음)
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
      const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
      const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('alt') ||
                    document.querySelector('meta[property="og:image:alt"]')?.getAttribute('content');
      if (ogTitle) parts.push(ogTitle);
      if (ogDesc) parts.push(ogDesc);
      if (ogImg) parts.push(ogImg);

      // 2. JSON-LD 구조화 데이터 (Course, Person 스키마)
      document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
        if (el.textContent) parts.push(el.textContent);
      });

      // 3. 제목 태그 (h1~h3) — 메인 이미지 주변 텍스트
      document.querySelectorAll('h1, h2, h3').forEach(el => {
        const t = el.textContent?.trim();
        if (t) parts.push(t);
      });

      // 4. 이미지 alt 텍스트 (메인 강사 이미지에 이름이 alt로 달린 경우)
      document.querySelectorAll('img').forEach(el => {
        const alt = el.getAttribute('alt')?.trim();
        if (alt && alt.length >= 2) parts.push(alt);
      });

      // 5. 강사 관련 키워드 주변 텍스트
      const allText = document.body?.innerText || '';
      parts.push(allText.substring(0, 6000));

      return parts.join('\n');
    });

    return text;
  } catch {
    return '';
  }
}

async function getVideoList(page: Page): Promise<Array<{ id: string; title: string; date: string }>> {
  const result = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (window as any).ytInitialData;
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videosTab = tabs?.find((t: any) => t?.tabRenderer?.title === '동영상');
    const contents = videosTab?.tabRenderer?.content?.richGridRenderer?.contents;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (contents || []).slice(0, 15).map((c: any) => {
      const v = c?.richItemRenderer?.content?.videoRenderer;
      if (!v) return null;
      return {
        id: v.videoId,
        title: v.title?.runs?.[0]?.text,
        date: v.publishedTimeText?.simpleText,
      };
    }).filter(Boolean);
    return JSON.stringify(items);
  });

  try {
    return JSON.parse(result as string) || [];
  } catch {
    return [];
  }
}

export async function checkYoutubeSponsors(
  channels: Array<{ channelName: string; channelUrl: string }>,
  onProgress?: ProgressCallback
): Promise<YoutubeSponsored[]> {
  const log = onProgress || (() => {});
  const results: YoutubeSponsored[] = [];

  return withPage(async (page) => {
    for (const channel of channels) {
      try {
        log(`🔍 채널 체크: ${channel.channelName}`);

        // 채널 /videos 페이지 방문
        const videosUrl = channel.channelUrl.replace(/\/$/, '') + '/videos';
        await page.goto(videosUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // 영상 목록 추출
        let videos = await getVideoList(page);
        if (videos.length === 0) {
          log(`  ⏳ 재시도 중...`);
          await page.waitForTimeout(2000);
          videos = await getVideoList(page);
        }

        if (videos.length === 0) {
          log(`  ⚠️ 영상 목록 없음, 스킵`);
          continue;
        }

        log(`  📹 영상 ${videos.length}개 발견`);

        // 7일 이내 영상만 필터
        const recentVideos = videos.filter(v => isWithin7Days(v.date));
        if (recentVideos.length === 0) {
          log(`  ⏭️ 최근 7일 이내 영상 없음`);
          continue;
        }

        log(`  🕐 최근 7일 이내 영상 ${recentVideos.length}개`);

        // 각 영상 방문하여 설명 확인
        for (const video of recentVideos) {
          try {
            const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
            await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);

            const descRaw = await page.evaluate(() => {
              const html = document.documentElement.innerHTML;
              const idx = html.indexOf('"shortDescription"');
              if (idx > 0) return html.substring(idx, idx + 5000); // 링크가 설명 뒤쪽에 있을 수 있어 넉넉히
              return 'NOT_FOUND';
            });

            if (descRaw === 'NOT_FOUND') continue;

            // YouTube shortDescription은 JSON 인코딩 → \/ → / 언이스케이프 필수
            const descText = descRaw.replace(/\\\//g, '/').replace(/\\n/g, '\n');

            const sponsorMatch = matchSponsorDomain(descText);
            if (sponsorMatch) {
              log(`  ✅ 협찬 발견: ${video.title} → ${sponsorMatch.platform}`);
              log(`  📄 협찬 페이지 텍스트 수집 중...`);
              const sponsorPageText = await fetchSponsorPageText(page, sponsorMatch.sponsorUrl);
              results.push({
                channelName: channel.channelName,
                channelUrl: channel.channelUrl,
                videoId: video.id,
                videoTitle: video.title,
                videoUrl: `https://youtu.be/${video.id}`,
                platform: sponsorMatch.platform,
                sponsorUrl: sponsorMatch.sponsorUrl,
                sponsorPageText,
                isUnresolvable: false,
              });
            } else if (hasNaverShortUrl(descText)) {
              const naverUrl = extractNaverShortUrl(descText);
              if (naverUrl) {
                log(`  🔗 네이버 단축URL 직접 접속: ${video.title}`);
                const resolved = await resolveNaverShortUrl(page, naverUrl);
                if (resolved) {
                  log(`  ✅ 네이버 단축URL 해석 성공: ${video.title} → ${resolved.platform}`);
                  // Naver 페이지 텍스트가 이미 있으면 재사용, 실제 플랫폼 URL이면 추가 방문
                  let sponsorPageText = resolved.pageText || '';
                  const isActualPlatformUrl = resolved.sponsorUrl.startsWith('http') &&
                    !resolved.sponsorUrl.includes('naver.com') &&
                    !resolved.sponsorUrl.includes('m.site');
                  if (isActualPlatformUrl) {
                    log(`  📄 협찬 페이지 텍스트 수집 중...`);
                    const extra = await fetchSponsorPageText(page, resolved.sponsorUrl);
                    sponsorPageText = [resolved.pageText, extra].join('\n');
                  }
                  results.push({
                    channelName: channel.channelName,
                    channelUrl: channel.channelUrl,
                    videoId: video.id,
                    videoTitle: video.title,
                    videoUrl: `https://youtu.be/${video.id}`,
                    platform: resolved.platform,
                    sponsorUrl: resolved.sponsorUrl,
                    sponsorPageText,
                    isUnresolvable: false,
                  });
                } else {
                  log(`  ⚠️ 네이버 단축URL 판별불가: ${video.title}`);
                  results.push({
                    channelName: channel.channelName,
                    channelUrl: channel.channelUrl,
                    videoId: video.id,
                    videoTitle: video.title,
                    videoUrl: `https://youtu.be/${video.id}`,
                    platform: '판별불가',
                    sponsorUrl: naverUrl,
                    sponsorPageText: '',
                    isUnresolvable: true,
                  });
                }
              }
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            log(`  ❌ 영상 체크 실패 (${video.title}): ${msg}`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`  ❌ 채널 체크 실패 (${channel.channelName}): ${msg}`);
      }
    }

    return results;
  });
}
