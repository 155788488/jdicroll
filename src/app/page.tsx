'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface CrawlResult {
  id: string;
  crawl_date: string;
  platform: string;
  instructor: string;
  course_title: string;
  enrollment_count: number | null;
  price: number | null;
  option_name: string;
  estimated_revenue: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface Schedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  days_of_week: number[];
  hour: number;
  minute: number;
  last_run_at: string | null;
}

const WEEKDAYS = [
  { label: '일', value: 0 }, { label: '월', value: 1 }, { label: '화', value: 2 },
  { label: '수', value: 3 }, { label: '목', value: 4 }, { label: '금', value: 5 }, { label: '토', value: 6 },
];

export default function Dashboard() {
  const [url, setUrl] = useState('');
  const [instructor, setInstructor] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // 설정 패널
  const [showSettings, setShowSettings] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>({
    enabled: false, frequency: 'daily', days_of_week: [1, 2, 3, 4, 5], hour: 9, minute: 0, last_run_at: null,
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [running, setRunning] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState({ notion: false, slack: false });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchResults();
  }, [selectedDate]);

  useEffect(() => {
    if (showSettings) {
      fetchSchedule();
      checkIntegrations();
    }
  }, [showSettings]);

  async function fetchResults() {
    try {
      const res = await fetch(`/api/results?date=${selectedDate}`);
      const data = await res.json();
      setResults(data.results || []);
      setSelectedIds(new Set());
    } catch {
      setResults([]);
      setSelectedIds(new Set());
    }
  }

  async function fetchSchedule() {
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      setSchedule(data);
    } catch {}
  }

  async function checkIntegrations() {
    try {
      const res = await fetch('/api/settings/integrations');
      const data = await res.json();
      setIntegrationStatus(data);
    } catch {}
  }

  async function saveSchedule() {
    setScheduleSaving(true);
    setScheduleMsg(null);
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule),
      });
      const data = await res.json();
      if (data.success) {
        setScheduleMsg({ text: '✅ 스케줄이 저장되었습니다.', type: 'success' });
        if (data.schedule) setSchedule(data.schedule);
      } else {
        setScheduleMsg({ text: `❌ 저장 실패: ${data.error}`, type: 'error' });
      }
    } catch {
      setScheduleMsg({ text: '❌ 저장 중 오류 발생', type: 'error' });
    } finally {
      setScheduleSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setScheduleMsg({ text: '⏳ 크롤링 실행 중...', type: 'info' });
    try {
      const res = await fetch('/api/schedule/run', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setScheduleMsg({ text: `✅ 완료! 성공 ${data.successCount}건 / 실패 ${data.failCount}건`, type: 'success' });
        await fetchSchedule();
        // 크롤링 결과 날짜(어제)로 전환하여 결과 표시
        if (data.crawlDate) {
          setSelectedDate(data.crawlDate);
        }
      } else {
        setScheduleMsg({ text: `❌ 실패: ${data.error}`, type: 'error' });
      }
    } catch {
      setScheduleMsg({ text: '❌ 실행 중 오류 발생', type: 'error' });
    } finally {
      setRunning(false);
    }
  }

  function toggleDay(day: number) {
    setSchedule(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day].sort(),
    }));
  }

  function formatLastRun(t: string | null) {
    if (!t) return '아직 실행된 적 없음';
    const kst = new Date(new Date(t).getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().replace('T', ' ').substring(0, 16) + ' KST';
  }

  async function handleCrawl() {
    if (!url.trim()) {
      setMessage({ text: '강의 URL을 입력해주세요', type: 'error' });
      return;
    }
    setCrawling(true);
    setMessage({ text: '크롤링 중... 잠깐만요 ⏳', type: 'info' });
    try {
      const res = await fetch('/api/crawl-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), instructor: instructor.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.result;
        if (data.alreadyCrawled) {
          setMessage({
            text: `ℹ️ 오늘 이미 조회된 강의입니다 (${r.platform} - ${r.enrollmentCount}건)`,
            type: 'info',
          });
        } else if (r.status === 'success') {
          setMessage({
            text: `✅ 완료! ${r.platform} - ${r.enrollmentCount}건 결제 (예상 매출: ${r.estimatedRevenue ? r.estimatedRevenue.toLocaleString() + '원' : '가격 미확인'})`,
            type: 'success',
          });
        } else {
          setMessage({ text: `⚠️ 결제 데이터를 찾지 못했어요.`, type: 'error' });
        }
        setUrl('');
        setInstructor('');
        if (!data.alreadyCrawled) {
          setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
          fetchResults();
        }
      } else {
        setMessage({ text: `❌ 실패: ${data.error}`, type: 'error' });
      }
    } catch {
      setMessage({ text: '❌ 오류가 발생했어요', type: 'error' });
    } finally {
      setCrawling(false);
    }
  }

  function toggleSelectAll() {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/results', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds(new Set());
        fetchResults();
      }
    } catch {} finally {
      setDeleting(false);
    }
  }

  const totalEnrollments = results.reduce((sum, r) => sum + (r.enrollment_count || 0), 0);
  const totalRevenue = results.reduce((sum, r) => sum + (r.estimated_revenue || 0), 0);

  function groupResults(rows: CrawlResult[]) {
    const map = new Map<string, {
      key: string; platform: string; instructor: string;
      baseTitle: string; options: CrawlResult[];
      totalRevenue: number; status: string;
    }>();
    for (const r of rows) {
      const baseTitle = r.course_title.replace(/ - [^-]+$/, '').trim();
      const key = `${r.platform}__${r.instructor}__${baseTitle}`;
      if (!map.has(key)) {
        map.set(key, { key, platform: r.platform, instructor: r.instructor, baseTitle, options: [], totalRevenue: 0, status: r.status });
      }
      const group = map.get(key)!;
      group.options.push(r);
      group.totalRevenue += r.estimated_revenue || 0;
      if (r.status === 'success') group.status = 'success';
    }
    return Array.from(map.values());
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🎓 강의 결제량 트래커</h1>
          <p className="text-gray-500 mt-1">유료 강의 URL을 넣으면 결제 건수를 자동으로 확인해요</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          설정
        </button>
      </div>

      {/* URL Input */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">강의 URL로 바로 조회</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">강의 URL <span className="text-red-500">*</span></label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCrawl()}
              placeholder="예: https://www.titanclass.co.kr/courses/abc123..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={crawling}
            />
            <p className="text-xs text-gray-400 mt-1">타이탄, 하버드, 코주부, 아이비, 인베이더, N잡연구소, 머니업, 부업의정석, 핏크닉 지원</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">강사명 (선택)</label>
            <input
              type="text"
              value={instructor}
              onChange={e => setInstructor(e.target.value)}
              placeholder="예: 유프로"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={crawling}
            />
          </div>
          <button
            onClick={handleCrawl}
            disabled={crawling || !url.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {crawling ? '조회 중...' : '🔍 결제 건수 조회'}
          </button>
        </div>
        {message && (
          <div className={`mt-4 p-4 rounded-xl text-sm font-medium ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
            message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
            'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            {message.text}
          </div>
        )}
      </div>

      {/* Summary */}
      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center">
            <p className="text-sm text-blue-600 font-medium">총 결제건수</p>
            <p className="text-3xl font-bold text-blue-700 mt-1">{totalEnrollments}건</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
            <p className="text-sm text-green-600 font-medium">총 예상매출</p>
            <p className="text-3xl font-bold text-green-700 mt-1">{totalRevenue.toLocaleString()}원</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-center">
            <p className="text-sm text-gray-600 font-medium">조회한 강의</p>
            <p className="text-3xl font-bold text-gray-700 mt-1">{groupResults(results).length}개</p>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">조회 결과</h2>
            {selectedIds.size > 0 && (
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:bg-gray-300 transition-colors"
              >
                {deleting ? '삭제 중...' : `🗑 ${selectedIds.size}건 삭제`}
              </button>
            )}
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-center w-10">
                  {results.length > 0 && (
                    <input
                      type="checkbox"
                      checked={results.length > 0 && selectedIds.size === results.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  )}
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">플랫폼</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">강사</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">강의</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">옵션별 결제건수</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500">총 예상매출</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-gray-400">
                    <div className="text-4xl mb-3">🔍</div>
                    <div>위에서 강의 URL을 넣고 조회해보세요</div>
                  </td>
                </tr>
              ) : (
                groupResults(results).map(group => {
                  const groupIds = group.options.map(o => o.id);
                  const allChecked = groupIds.every(id => selectedIds.has(id));
                  const someChecked = groupIds.some(id => selectedIds.has(id));
                  return (
                  <tr key={group.key} className="hover:bg-gray-50">
                    <td className="px-3 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                        onChange={() => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (allChecked) {
                              groupIds.forEach(id => next.delete(id));
                            } else {
                              groupIds.forEach(id => next.add(id));
                            }
                            return next;
                          });
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-gray-900">{group.platform}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{group.instructor}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 max-w-xs truncate" title={group.baseTitle}>{group.baseTitle}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        {group.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{opt.option_name}</span>
                            <span className="text-sm font-bold text-blue-600">{opt.enrollment_count ?? '-'}건</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm font-semibold text-green-600">
                        {group.totalRevenue ? `${group.totalRevenue.toLocaleString()}원` : '-'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                        group.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {group.status === 'success' ? '성공' : '실패'}
                      </span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 설정 패널 오버레이 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            {/* 패널 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">설정</h2>
              <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
              {/* 자동 실행 스케줄 */}
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">자동 실행 스케줄</h3>
                <p className="text-xs text-gray-500 mb-4">
                  설정한 시간에 노션 일정을 읽어 자동 크롤링합니다.
                  <br />
                  <span className="text-orange-600">배포 후 cron-job.org에서 <code>/api/schedule/check</code>를 1분마다 호출 필요</span>
                </p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">스케줄 활성화</p>
                      <p className="text-xs text-gray-400 mt-0.5">마지막 실행: {formatLastRun(schedule.last_run_at)}</p>
                    </div>
                    <button
                      onClick={() => setSchedule(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className={`relative w-12 h-6 rounded-full transition-colors ${schedule.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${schedule.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-2">실행 주기</p>
                    <div className="flex gap-2">
                      {[{ label: '매일', value: 'daily' }, { label: '매주', value: 'weekly' }].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setSchedule(prev => ({ ...prev, frequency: opt.value as 'daily' | 'weekly' }))}
                          className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            schedule.frequency === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {schedule.frequency === 'weekly' && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-2">실행 요일</p>
                      <div className="flex gap-1.5">
                        {WEEKDAYS.map(day => (
                          <button
                            key={day.value}
                            onClick={() => toggleDay(day.value)}
                            className={`w-9 h-9 rounded-full text-xs font-medium border transition-colors ${
                              schedule.days_of_week.includes(day.value) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-2">실행 시간 (KST)</p>
                    <div className="flex items-center gap-2">
                      <select value={schedule.hour} onChange={e => setSchedule(prev => ({ ...prev, hour: Number(e.target.value) }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}시</option>)}
                      </select>
                      <span className="text-gray-400">:</span>
                      <select value={schedule.minute} onChange={e => setSchedule(prev => ({ ...prev, minute: Number(e.target.value) }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {[0, 10, 15, 20, 30, 45].map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>)}
                      </select>
                    </div>
                  </div>
                  {scheduleMsg && (
                    <div className={`p-3 rounded-lg text-xs font-medium ${
                      scheduleMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
                      scheduleMsg.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                      'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}>
                      {scheduleMsg.text}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={saveSchedule} disabled={scheduleSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors">
                      {scheduleSaving ? '저장 중...' : '저장'}
                    </button>
                    <button onClick={runNow} disabled={running} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:bg-gray-300 transition-colors">
                      {running ? '실행 중...' : '▶ 지금 실행'}
                    </button>
                  </div>
                </div>
              </section>

              {/* 외부 연동 상태 */}
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">외부 연동 상태</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-4 rounded-xl border ${integrationStatus.notion ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-sm font-medium text-gray-900">Notion</p>
                    <p className="text-xs text-gray-500 mt-0.5">{integrationStatus.notion ? '✅ 연동됨' : '⬜ 미연동'}</p>
                  </div>
                  <div className={`p-4 rounded-xl border ${integrationStatus.slack ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-sm font-medium text-gray-900">Slack</p>
                    <p className="text-xs text-gray-500 mt-0.5">{integrationStatus.slack ? '✅ 연동됨' : '⬜ 미연동'}</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
