'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

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

interface SponsoredVideo {
  platform: string;
  instructorName: string;
  lectureDate: string | null;
  channelName: string;
  videoTitle: string;
  videoId: string;
}

interface TrackerResult {
  checkedChannels: number;
  sponsoredCount: number;
  updatedCount: number;
  sponsoredVideos: SponsoredVideo[];
  newInstructors: string[];
  unresolvable: string[];
}

export default function YoutubeTrackerPage() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<TrackerResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resumedFromBg, setResumedFromBg] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>({
    enabled: false, frequency: 'weekly', days_of_week: [2], hour: 15, minute: 30, last_run_at: null,
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    fetch('/api/youtube-tracker-schedule')
      .then(r => r.json())
      .then(data => setSchedule(data))
      .catch(() => {});
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const data = await fetch('/api/youtube-tracker').then(r => r.json());
        setLogs(data.logs ?? []);
        if (!data.running) {
          setRunning(false);
          if (data.result) setResult(data.result);
          if (data.error) setErrorMsg(data.error);
          stopPolling();
        }
      } catch {}
    }, 1500);
  }, [stopPolling]);

  // 마운트 시 백그라운드 실행 중인지 확인
  useEffect(() => {
    fetch('/api/youtube-tracker')
      .then(r => r.json())
      .then(data => {
        if (data.running) {
          setRunning(true);
          setLogs(data.logs ?? []);
          setResumedFromBg(true);
          startPolling();
        } else if (data.result || (data.logs && data.logs.length > 0)) {
          setLogs(data.logs ?? []);
          if (data.result) setResult(data.result);
          if (data.error) setErrorMsg(data.error);
        }
      })
      .catch(() => {});

    return () => stopPolling();
  }, [startPolling, stopPolling]);

  async function handleRun() {
    setResumedFromBg(false);
    const data = await fetch('/api/youtube-tracker', { method: 'POST' })
      .then(r => r.json())
      .catch(() => null);

    if (!data) {
      setErrorMsg('요청 중 오류가 발생했어요');
      return;
    }

    if (data.alreadyRunning) {
      setRunning(true);
      setLogs(data.state?.logs ?? []);
      setResult(null);
      setErrorMsg(null);
      setResumedFromBg(true);
      startPolling();
      return;
    }

    if (data.started) {
      setRunning(true);
      setLogs(['🚀 유튜브 트래커 시작...']);
      setResult(null);
      setErrorMsg(null);
      startPolling();
    }
  }

  async function saveSchedule() {
    setScheduleSaving(true);
    setScheduleMsg(null);
    try {
      const res = await fetch('/api/youtube-tracker-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule),
      });
      const data = await res.json();
      if (data.success) {
        setScheduleMsg({ text: '스케줄이 저장되었습니다.', type: 'success' });
        if (data.schedule) setSchedule(data.schedule);
      } else {
        setScheduleMsg({ text: `저장 실패: ${data.error}`, type: 'error' });
      }
    } catch {
      setScheduleMsg({ text: '저장 중 오류 발생', type: 'error' });
    } finally {
      setScheduleSaving(false);
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📺 유튜브 트래커</h1>
          <p className="text-gray-500 mt-1">유튜브 채널에서 최근 7일 협찬 영상을 확인하고 노션에 기록해요</p>
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

      {/* 백그라운드 실행 복원 안내 */}
      {resumedFromBg && running && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          페이지를 나갔다 와도 트래커가 백그라운드에서 계속 실행 중입니다.
        </div>
      )}

      {/* Action */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
        <button
          onClick={handleRun}
          disabled={running}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {running ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              체크 중...
            </span>
          ) : (
            '📺 지금 체크 실행'
          )}
        </button>
      </div>

      {/* 실시간 로그 */}
      {(running || logs.length > 0) && (
        <div className="bg-gray-900 rounded-2xl p-4 mb-6 font-mono text-sm">
          <p className="text-gray-400 text-xs mb-2">진행 로그</p>
          <div className="max-h-80 overflow-y-auto space-y-0.5">
            {logs.map((log, i) => (
              <div key={i} className={`${
                log.startsWith('❌') ? 'text-red-400' :
                log.startsWith('✔️') || log.startsWith('✅') || log.startsWith('💾') ? 'text-green-400' :
                log.startsWith('⏭️') ? 'text-yellow-400' :
                log.startsWith('🏁') || log.startsWith('🚀') ? 'text-blue-400' :
                'text-gray-300'
              }`}>
                {log || '\u00A0'}
              </div>
            ))}
            {running && (
              <div className="text-gray-500 animate-pulse">▋</div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* 에러 */}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-800">
          {errorMsg}
        </div>
      )}

      {/* 결과 요약 */}
      {result && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center">
              <p className="text-sm text-blue-600 font-medium">체크 채널</p>
              <p className="text-3xl font-bold text-blue-700 mt-1">{result.checkedChannels}개</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
              <p className="text-sm text-green-600 font-medium">협찬 발견</p>
              <p className="text-3xl font-bold text-green-700 mt-1">{result.sponsoredCount}건</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 text-center">
              <p className="text-sm text-yellow-600 font-medium">노션 업데이트</p>
              <p className="text-3xl font-bold text-yellow-700 mt-1">{result.updatedCount}건</p>
            </div>
          </div>

          {/* 협찬 영상 목록 */}
          {result.sponsoredVideos.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">협찬 영상 목록</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">플랫폼</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">강사명</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">영상 제목</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">채널명</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-gray-500">링크</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.sponsoredVideos.map((video, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-4 text-sm font-medium text-gray-900">{video.platform}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{video.instructorName === '미확인' ? '신규 강사' : video.instructorName}</td>
                        <td className="px-5 py-4 text-sm text-gray-600 max-w-xs truncate" title={video.videoTitle}>{video.videoTitle}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{video.channelName}</td>
                        <td className="px-5 py-4 text-center">
                          <a href={`https://youtu.be/${video.videoId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800" title="영상 보기">🔗</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 새 강사 발견 */}
          {result.newInstructors.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-orange-800 mb-2">새 강사 발견</h3>
              <ul className="space-y-1">
                {result.newInstructors.map((name, i) => (
                  <li key={i} className="text-sm text-orange-700">• {name}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 판별 불가 */}
          {result.unresolvable.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-yellow-800 mb-2">판별 불가</h3>
              <ul className="space-y-1">
                {result.unresolvable.map((item, i) => (
                  <li key={i} className="text-sm text-yellow-700">• {item}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* 설정 패널 오버레이 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">설정</h2>
              <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">자동 실행 스케줄</h3>
              <p className="text-xs text-gray-500 mb-4">
                설정한 시간에 자동으로 유튜브 협찬 체크를 실행합니다.
                <br />
                <span className="text-orange-600">배포 후 cron-job.org에서 <code>/api/youtube-tracker-schedule/check</code>를 1분마다 호출 필요</span>
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
                    scheduleMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {scheduleMsg.text}
                  </div>
                )}
                <button onClick={saveSchedule} disabled={scheduleSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors">
                  {scheduleSaving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
