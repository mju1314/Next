import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

type Tab = {
  href: string;
  label: string;
  icon: ReactNode;
};

function Icon({ path }: { path: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {path.split("|").map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}

const tabs: Tab[] = [
  { href: "/", label: "今日", icon: <Icon path="M12 2v4|m4.93 4.93 2.83-2.83|M22 12h-4|M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" /> },
  { href: "/tasks", label: "任务", icon: <Icon path="M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01" /> },
  { href: "/inbox", label: "收集", icon: <Icon path="M22 12h-6l-2 3h-4l-2-3H2|M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" /> },
  { href: "/review", label: "复盘", icon: <Icon path="m12 2 2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6Z" /> },
  { href: "/settings", label: "我的", icon: <Icon path="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /> },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)]">
      <div className="mx-auto flex max-w-app items-stretch justify-around rounded-[28px] border border-white/75 bg-white/80 px-1.5 py-1.5 shadow-nav backdrop-blur-2xl">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);

          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={`flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 rounded-[22px] text-[11px] font-semibold transition-all ${active ? "bg-primary text-white shadow-[0_10px_22px_rgba(10,132,255,0.24)]" : "text-muted hover:bg-white/70"}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
