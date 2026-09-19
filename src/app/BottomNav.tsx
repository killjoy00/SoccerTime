"use client";

import Link from "next/link";

export type MainTab = "match" | "squad" | "draft" | "players" | "league";

const items: Array<{ id: MainTab; icon: string; label: string }> = [
  { id: "match", icon: "⚽", label: "Match" },
  { id: "squad", icon: "♟", label: "Squad" },
  { id: "draft", icon: "↻", label: "Draft" },
  { id: "players", icon: "◎", label: "Players" },
  { id: "league", icon: "🏆", label: "League" },
];

export default function BottomNav({
  active,
  onSelect,
  draftOpen = false,
}: {
  active: MainTab | "history";
  onSelect?: (tab: MainTab) => void;
  draftOpen?: boolean;
}) {
  const visibleItems = items.filter((item) => item.id !== "draft" || draftOpen);
  return <nav className="bottom" aria-label="SoccerTime navigation">
    <div className="bottomin" style={{ gridTemplateColumns: `repeat(${visibleItems.length + 1}, 1fr)` }}>
      {visibleItems.map((item) => onSelect ? (
        <button
          key={item.id}
          type="button"
          className={`nav ${active === item.id ? "active" : ""}`}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => onSelect(item.id)}
        >
          <b aria-hidden="true">{item.icon}</b>
          <span>{item.label}</span>
        </button>
      ) : (
        <Link
          key={item.id}
          className={`nav ${active === item.id ? "active" : ""}`}
          aria-current={active === item.id ? "page" : undefined}
          href={`/?tab=${item.id}`}
        >
          <b aria-hidden="true">{item.icon}</b>
          <span>{item.label}</span>
        </Link>
      ))}
      <Link className={`nav ${active === "history" ? "active" : ""}`} aria-current={active === "history" ? "page" : undefined} href="/history">
        <b aria-hidden="true">▥</b>
        <span>History</span>
      </Link>
    </div>
  </nav>;
}
