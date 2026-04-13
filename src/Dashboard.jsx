import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import AIAssistant from "./components/AIAssistant";
import { Icon } from "./brand";
import { formatLiveDateTime } from "./utils";

const navItems = {
  employee: [
    { to: "attendance", label: "Attendance", icon: "attendance" },
    { to: "leave", label: "Leave", icon: "leave" },
    { to: "mail", label: "Mail", icon: "mail" },
    { to: "chat", label: "Chat", icon: "chat" },
    { to: "daily-report", label: "Daily Report", icon: "report" },
    { to: "salary-slips", label: "Salary Slips", icon: "salary" },
    { to: "assets", label: "My Assets", icon: "assets" },
    { to: "profile", label: "Profile", icon: "profile" },
  ],
  hr: [
    { to: "overview", label: "Overview", icon: "overview" },
    { to: "employees", label: "Employees", icon: "employees" },
    { to: "leave-approvals", label: "Leave Approvals", icon: "leave" },
    { to: "broadcast", label: "Broadcast Mail", icon: "broadcast" },
    { to: "chat", label: "Chat", icon: "chat" },
    { to: "reports", label: "Reports", icon: "report" },
    { to: "salary-slips", label: "Salary Slips", icon: "salary" },
    { to: "assets", label: "Assets", icon: "assets" },
  ],
  admin: [
    { to: "overview", label: "Overview", icon: "overview" },
    { to: "employees", label: "Employees", icon: "employees" },
    { to: "leave-approvals", label: "Leave Approvals", icon: "leave" },
    { to: "broadcast", label: "Broadcast Mail", icon: "broadcast" },
    { to: "chat", label: "Chat", icon: "chat" },
    { to: "reports", label: "Reports", icon: "report" },
    { to: "salary-slips", label: "Salary Slips", icon: "salary" },
    { to: "role-management", label: "Role Management", icon: "roles" },
    { to: "analytics", label: "Analytics", icon: "analytics" },
    { to: "company-settings", label: "Company Settings", icon: "settings" },
    { to: "assets", label: "Assets", icon: "assets" },
  ],
  super_admin: [{ to: "super-admin", label: "Platform Control", icon: "platform" }],
};

export default function Dashboard({ supabase, profile, company, refreshProfile, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const baseItems = useMemo(() => navItems[profile.role] ?? navItems.employee, [profile.role]);
  const items = useMemo(
    () =>
      baseItems.map((item) =>
        item.to === "chat"
          ? {
              ...item,
              badge: chatUnreadCount,
            }
          : item,
      ),
    [baseItems, chatUnreadCount],
  );
  const activeItem = useMemo(
    () => items.find((item) => location.pathname === `/app/${item.to}`) ?? items[0],
    [items, location.pathname],
  );

  const loadChatUnreadCount = async () => {
    if (!profile?.company_id || profile.role === "super_admin") {
      setChatUnreadCount(0);
      return;
    }

    const [membersResponse, messagesResponse] = await Promise.all([
      supabase.from("channel_members").select("channel_id, last_read_at").eq("user_id", profile.id),
      supabase.from("messages").select("channel_id, created_at, sender_id").eq("company_id", profile.company_id),
    ]);

    if (membersResponse.error || messagesResponse.error) {
      setChatUnreadCount(0);
      return;
    }

    const lastReadMap = (membersResponse.data ?? []).reduce((accumulator, item) => {
      accumulator[item.channel_id] = item.last_read_at ? new Date(item.last_read_at).getTime() : 0;
      return accumulator;
    }, {});

    const unread = (messagesResponse.data ?? []).reduce((count, item) => {
      const createdAt = item.created_at ? new Date(item.created_at).getTime() : 0;
      const lastReadAt = lastReadMap[item.channel_id] ?? 0;
      if (item.sender_id !== profile.id && createdAt > lastReadAt) {
        return count + 1;
      }
      return count;
    }, 0);

    setChatUnreadCount(unread);
  };

  useEffect(() => {
    const allowedPaths = items.map((item) => `/app/${item.to}`);
    if (!allowedPaths.includes(location.pathname) && location.pathname !== "/app") {
      navigate(`/app/${items[0].to}`, { replace: true });
    }
    setSidebarOpen(false);
  }, [items, location.pathname, navigate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      if (!profile?.company_id || profile.role === "super_admin") return;

      const { data } = await supabase
        .from("companies")
        .select("status")
        .eq("id", profile.company_id)
        .single();

      if (data?.status === "suspended" || data?.status === "rejected") {
        await onLogout();
        navigate("/login", { replace: true });
      }
    };

    checkStatus();
  }, [navigate, onLogout, profile?.company_id, profile?.role, supabase]);

  useEffect(() => {
    loadChatUnreadCount();
  }, [profile?.company_id, profile?.id, profile?.role]);

  useEffect(() => {
    if (!profile?.company_id || profile.role === "super_admin") return undefined;

    const chatChannel = supabase
      .channel(`dashboard-chat-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `company_id=eq.${profile.company_id}`,
        },
        () => {
          loadChatUnreadCount();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_members",
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          loadChatUnreadCount();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
    };
  }, [profile?.company_id, profile?.id, profile?.role, supabase]);

  const handleLogout = async () => {
    await onLogout();
    navigate("/auth", { replace: true });
  };

  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      <button
        type="button"
        className={`sidebar-overlay${sidebarOpen ? " visible" : ""}`}
        aria-label="Close navigation"
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="sidebar">
        <div className="sidebar-main">
          <div className="sidebar-toprow">
            <button type="button" className="sidebar-brand" onClick={() => navigate("/app")}>
              <span className="brand-monogram">WP</span>
              <span className="brand-wordmark">WorkPulse</span>
            </button>
            <button
              type="button"
              className="icon-button sidebar-close"
              aria-label="Close navigation"
              onClick={() => setSidebarOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>

          <nav className="sidebar-nav">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
              >
                <span className="nav-item-copy">
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </span>
                {item.badge ? <span className="nav-badge nav-badge-alert">{item.badge > 99 ? "99+" : item.badge}</span> : null}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-user">
          <div className="account-avatar sidebar-avatar">{profile.name?.slice(0, 1)?.toUpperCase() ?? "U"}</div>
          <div>
            <strong>{profile.name}</strong>
            <span>{profile.role.replaceAll("_", " ")}</span>
          </div>
        </div>
      </aside>

      <main className="content-area">
        <header className="topbar">
          <div className="topbar-heading">
            <div className="topbar-title-row">
              <button
                type="button"
                className="icon-button sidebar-toggle"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
              >
                <Icon name="menu" />
              </button>
              <h1>{activeItem?.label ?? company?.name ?? "WorkPulse"}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="topbar-date">{formatLiveDateTime(now)}</span>
            <div className="account-menu" ref={menuRef}>
              <button
                type="button"
                className="account-trigger compact"
                onClick={() => setMenuOpen((current) => !current)}
                aria-expanded={menuOpen}
              >
                <div className="account-avatar">{profile.name?.slice(0, 1)?.toUpperCase() ?? "U"}</div>
                <div className="account-summary">
                  <strong>{profile.name}</strong>
                </div>
              </button>

              {menuOpen ? (
                <div className="account-dropdown">
                  <div className="account-dropdown-header">
                    <strong>{profile.name}</strong>
                    <span>{profile.email}</span>
                  </div>
                  <div className="account-dropdown-actions">
                    {items.some((item) => item.to === "profile") ? (
                      <button
                        type="button"
                        className="ghost-button full-width"
                        onClick={() => {
                          setMenuOpen(false);
                          navigate("/app/profile");
                        }}
                      >
                        Open Profile
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button full-width"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/app/notifications");
                      }}
                    >
                      Notifications
                    </button>
                    <button
                      type="button"
                      className="ghost-button full-width"
                      onClick={() => {
                        setMenuOpen(false);
                        refreshProfile();
                      }}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="primary-button full-width"
                      onClick={() => {
                        setMenuOpen(false);
                        handleLogout();
                      }}
                    >
                      Logout
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <Outlet
          context={{
            supabase,
            profile,
            company,
            refreshProfile,
            pendingLeaves: 0,
            setPendingLeaves: () => {},
            chatUnreadCount,
            refreshChatUnreadCount: loadChatUnreadCount,
          }}
        />
        {profile && company?.status === "approved" ? (
          <AIAssistant supabase={supabase} profile={profile} company={company} />
        ) : null}
      </main>
    </div>
  );
}
