import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

export type Crumb = { label: string; to?: string };

type Theme = "dark" | "light";

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem("citizens-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be blocked; fall back to the system preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("citizens-theme", theme);
    } catch {
      // Non-essential.
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "World map", icon: "map", end: true },
  { to: "/regions", label: "Regions", icon: "list" },
  { to: "/scripts", label: "Scripts", icon: "script" },
];

const LIBRARY: { to: string; label: string; icon: IconName }[] = [
  { to: "/entities/npc", label: "Entity browser", icon: "cube" },
  { to: "/kits", label: "Kit browser", icon: "shirt" },
  { to: "/favorites", label: "Favorites", icon: "star" },
];

/**
 * Persistent chrome for every route: a sidebar for navigation and a top bar carrying
 * breadcrumbs and page-level actions. `full` pages (the world map, region workspace) get an
 * unpadded, non-scrolling content area and manage their own layout.
 */
export function AppShell({
  crumbs,
  actions,
  full = false,
  children,
}: {
  crumbs?: Crumb[];
  actions?: ReactNode;
  full?: boolean;
  children: ReactNode;
}) {
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const last = crumbs?.[crumbs.length - 1]?.label;
    document.title = last ? `${last} · Citizens Helper` : "Citizens Helper";
  }, [crumbs]);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <Link to="/" className="brand">
          <div className="brand-mark">C</div>
          <div className="brand-text">
            <div className="brand-name">Citizens</div>
            <div className="brand-sub">Plugin helper</div>
          </div>
        </Link>
        <div className="nav-label">World</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-link" title={n.label}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div className="nav-label">Library</div>
        {LIBRARY.map((n) => (
          <NavLink key={n.to} to={n.to} className="nav-link" title={n.label}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div className="sidebar-footer">
          <button className="btn-ghost" onClick={toggleTheme} title="Toggle light/dark theme">
            <Icon name={theme === "dark" ? "sun" : "moon"} />
            <span className="theme-label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </nav>
      <div className="main">
        {(crumbs || actions) && (
          <header className="topbar">
            <div className="crumbs">
              {crumbs?.map((c, i) => (
                <span key={i} className="row-tight">
                  {i > 0 && <span className="sep">/</span>}
                  {c.to && i < crumbs.length - 1 ? (
                    <Link to={c.to}>{c.label}</Link>
                  ) : (
                    <span className={i === crumbs.length - 1 ? "current truncate" : ""}>{c.label}</span>
                  )}
                </span>
              ))}
            </div>
            <div className="spacer" />
            {actions}
          </header>
        )}
        {full ? <div className="page-full">{children}</div> : <div className="page">{children}</div>}
      </div>
    </div>
  );
}

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="empty" style={{ height: "100%" }}>
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}
