export function WorkPulseLogo({ compact = false, large = false, subtitle, className = "" }) {
  return (
    <div className={`workpulse-logo${compact ? " compact" : ""}${large ? " large" : ""}${className ? ` ${className}` : ""}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true" className="workpulse-logo-mark">
        <rect x="4" y="8" width="40" height="32" rx="12" className="logo-shell" />
        <rect x="11" y="17" width="6" height="14" rx="2.5" className="logo-bar" />
        <rect x="21" y="13" width="6" height="18" rx="2.5" className="logo-bar" />
        <rect x="31" y="20" width="6" height="11" rx="2.5" className="logo-bar" />
        <path d="M10 28h7l3-7 4 12 4-9h10" className="logo-pulse" />
      </svg>
      <div className="workpulse-logo-copy">
        <strong>WorkPulse</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </div>
  );
}

export function Icon({ name, className = "" }) {
  const props = {
    className: `icon${className ? ` ${className}` : ""}`,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  switch (name) {
    case "overview":
      return (
        <svg {...props}>
          <path d="M4 13h6V5H4zM14 19h6v-8h-6zM14 5h6v6h-6zM4 19h6v-2H4z" />
        </svg>
      );
    case "attendance":
      return (
        <svg {...props}>
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M8 3v4M16 3v4M7 11h10M9 15l2 2 4-4" />
        </svg>
      );
    case "leave":
      return (
        <svg {...props}>
          <path d="M6 20c6 0 12-5 12-12-7 0-12 6-12 12Z" />
          <path d="M12 8c1.5 0 3.5 1 4 3" />
        </svg>
      );
    case "mail":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m5 8 7 5 7-5" />
        </svg>
      );
    case "report":
      return (
        <svg {...props}>
          <path d="M8 3h6l5 5v13a1 1 0 0 1-1 1H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v6h6M9 14h6M9 18h6" />
        </svg>
      );
    case "salary":
      return (
        <svg {...props}>
          <rect x="3" y="6" width="18" height="12" rx="3" />
          <path d="M7 12h10M8 9h.01M16 15h.01" />
        </svg>
      );
    case "assets":
      return (
        <svg {...props}>
          <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
          <path d="m4 7 8 4 8-4M12 11v10" />
        </svg>
      );
    case "employees":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3.5" />
          <path d="M17 11a3 3 0 1 0 0-6M21 21v-2a4 4 0 0 0-3-3.87" />
        </svg>
      );
    case "broadcast":
      return (
        <svg {...props}>
          <path d="M4 11v2a2 2 0 0 0 2 2h1l3 4V5L7 9H6a2 2 0 0 0-2 2Z" />
          <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...props}>
          <path d="M4 19h16M7 16V9M12 16V5M17 16v-7" />
        </svg>
      );
    case "roles":
      return (
        <svg {...props}>
          <path d="M12 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M4 20a8 8 0 0 1 16 0M19 5l2 2-4 4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <path d="M12 3v3M12 18v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      );
    case "notifications":
      return (
        <svg {...props}>
          <path d="M15 17H5.5a1.5 1.5 0 0 1-1.2-2.4L6 12V9a6 6 0 1 1 12 0v3l1.7 2.6a1.5 1.5 0 0 1-1.2 2.4H15" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case "chat":
      return (
        <svg {...props}>
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 4v-4H7.5A2.5 2.5 0 0 1 5 12.5Z" />
          <path d="M9 8.5h6M9 11.5h4" />
        </svg>
      );
    case "profile":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "platform":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="14" rx="3" />
          <path d="M7 20h10M9 8h6M8 12h8" />
        </svg>
      );
    case "menu":
      return (
        <svg {...props}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case "close":
      return (
        <svg {...props}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 3 5 6v5c0 5 3.5 8.5 7 10 3.5-1.5 7-5 7-10V6l-7-3Z" />
          <path d="m9.5 12 1.8 1.8L15 10" />
        </svg>
      );
    case "pulse":
      return (
        <svg {...props}>
          <path d="M3 12h4l2-5 4 10 2-5h6" />
        </svg>
      );
    case "team":
      return (
        <svg {...props}>
          <path d="M16 21v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
          <circle cx="9" cy="8" r="3" />
          <path d="M22 21v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <path d="M5 18 11 12l4 4 4-7" />
          <path d="M5 5v13h14" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="m5 13 4 4L19 7" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}
