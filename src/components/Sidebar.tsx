'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', icon: '🎓', label: '결제량 트래커' },
  { href: '/free-monitor', icon: '🔍', label: '무료강의 모니터링' },
  { href: '/youtube-tracker', icon: '📺', label: '유튜브 트래커' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-white border-r border-gray-200 min-h-screen flex-shrink-0">
      <div className="px-5 py-6">
        <h2 className="text-lg font-bold text-gray-900">강의 트래커</h2>
      </div>
      <nav className="px-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
