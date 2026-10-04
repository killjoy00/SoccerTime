"use client";

import Link from "next/link";

export type MainTab = "match" | "squad" | "draft" | "players" | "league";
type NavId = MainTab | "history";

const items: Array<{ id: MainTab; label: string }> = [
  { id: "match", label: "Matchup" },
  { id: "squad", label: "Team" },
  { id: "draft", label: "Draft" },
  { id: "players", label: "Players" },
  { id: "league", label: "League" },
];

function NavIcon({ id }: { id: NavId }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
    className: "navIconSvg",
  };

  if (id === "match") return <svg {...common}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m9.2 8.8 2.8-2 2.8 2-1.1 3.3h-3.4L9.2 8.8Z" />
    <path d="m10.3 12.1-2.5 2.4M13.7 12.1l2.5 2.4M9.6 17.7l2.4-1.3 2.4 1.3" />
  </svg>;

  if (id === "squad") return <svg {...common}>
    <path d="M4 5.5h16v13H4z" />
    <circle cx="12" cy="8.5" r="1.35" />
    <circle cx="8.1" cy="13" r="1.35" />
    <circle cx="15.9" cy="13" r="1.35" />
    <circle cx="12" cy="16.3" r="1.35" />
  </svg>;

  if (id === "draft") return <svg {...common}>
    <path d="M5 7.5h9.7" />
    <path d="m12 4.8 2.7 2.7L12 10.2" />
    <path d="M19 16.5H9.3" />
    <path d="m12 13.8-2.7 2.7 2.7 2.7" />
    <rect x="5" y="12.4" width="3.3" height="3.3" rx=".8" />
    <rect x="15.7" y="8.3" width="3.3" height="3.3" rx=".8" />
  </svg>;

  if (id === "players") return <svg {...common}>
    <circle cx="12" cy="8.2" r="3" />
    <path d="M6.7 18.7c.7-3.3 2.5-5 5.3-5s4.6 1.7 5.3 5" />
    <path d="M4.3 10.8c-.9.7-1.5 1.7-1.8 3.1M19.7 10.8c.9.7 1.5 1.7 1.8 3.1" />
  </svg>;

  if (id === "league") return <svg {...common}>
    <path d="M8 4.5h8v3.2c0 3.1-1.4 5-4 5s-4-1.9-4-5V4.5Z" />
    <path d="M8 6H5.3v1.7c0 2 1.1 3.2 3 3.4M16 6h2.7v1.7c0 2-1.1 3.2-3 3.4M12 12.7v3.2M8.8 19.5h6.4M10 15.9h4" />
  </svg>;

  return <svg {...common}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.3v5l3.2 2M7.4 4.9 5.8 3.4M16.6 4.9l1.6-1.5" />
  </svg>;
}

function NavContents({ id, label }: { id: NavId; label: string }) {
  return <>
    <span className="navSelect" aria-hidden="true" />
    <span className="navGlyph"><NavIcon id={id} /></span>
    <span className="navLabel">{label}</span>
  </>;
}

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
    <div className="bottomFrame">
      <div className="bottomSheen" aria-hidden="true" />
      <div className="bottomin" style={{ gridTemplateColumns: `repeat(${visibleItems.length + 1}, 1fr)` }}>
        {visibleItems.map((item) => onSelect ? (
          <button
            key={item.id}
            type="button"
            className={`nav ${active === item.id ? "active" : ""}`}
            aria-current={active === item.id ? "page" : undefined}
            aria-label={item.label}
            onClick={() => onSelect(item.id)}
          >
            <NavContents id={item.id} label={item.label} />
          </button>
        ) : (
          <Link
            key={item.id}
            className={`nav ${active === item.id ? "active" : ""}`}
            aria-current={active === item.id ? "page" : undefined}
            href={`/?tab=${item.id}`}
          >
            <NavContents id={item.id} label={item.label} />
          </Link>
        ))}
        <Link
          className={`nav ${active === "history" ? "active" : ""}`}
          aria-current={active === "history" ? "page" : undefined}
          href="/history"
        >
          <NavContents id="history" label="History" />
        </Link>
      </div>
    </div>
  </nav>;
}
