import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getToday } from "./utils";

const navItems = {
  employee: [
    { to: "attendance", label: "Attendance" },
    { to: "leave", label: "Leave" },
    { to: "mail", label: "Mail" },
    { to: "daily-report", label: "Daily Report" },
    { to: "salary-slips", label: "Salary Slips" },
    { to: "assets", label: "My Assets" },
    { to: "notifications", label: "Notifications" },
    { to: "profile", label: "Profile" },
  ],
  hr: [
    { to: "overview", label: "Overview" },
    { to: "employees", label: "Employees" },
    { to: "leave-approvals", label: "Leave Approvals", badgeKey: "pendingLeaves" },
    { to: "broadcast", label: "Broadcast Mail" },
    { to: "reports", label: "Reports" },
    { to: "salary-slips", label: "Salary Slips" },
    { to: "assets", label: "Assets" },
    { to: "notifications", label: "Notifications" },
  ],
  admin: [
    { to: "overview", label: "Overview" },
    { to: "employees", label: "Employees" },
    { to: "leave-approvals", label: "Leave Approvals", badgeKey: "pendingLeaves" },
    { to: "broadcast", label: "Broadcast Mail" },
    { to: "reports", label: "Reports" },
    { to: "salary-slips", label: "Salary Slips" },
    { to: "role-management", label: "Role Management" },
    { to: "analytics", label: "Analytics" },
    { to: "company-settings", label: "Company Settings" },
    { to: "assets", label: "Assets" },
    { to: "notifications", label: "Notifications" },
  ],
  super_admin: [
    { to: "super-admin", label: "Platform Control" },
    { to: "notifications", label: "Notifications" },
  ],
};

export default function Dashboard({ supabase, profile, company, refreshProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingLeaves, setPendingLeaves] = useState(0);

  const items = useMemo(() => navItems[profile.role] ?? navItems.employee, [profile.role]);
  const activeItem = useMemo(
    () => items.find((item) => location.pathname === `/app/${item.to}`) ?? items[0],
    [items, location.pathname],
  );
  const workspaceStats = useMemo(() => {
    const stats = [
      {
        label: "Workspace",
        value: profile.role === "super_admin" ? "Platform Control" : company?.name ?? "Company Workspace",
      },
      {
        label: "Role Access",
        value: profile.role.replaceAll("_", " ").toUpperCase(),
      },
    ];

    if (profile.role === "super_admin") {
      stats.push(
        { label: "Focus", value: "Verification + Operations" },
        { label: "Today", value: getToday() },
      );
      return stats;
    }

    stats.push(
      { label: "Verification", value: company?.verification_status?.replaceAll("_", " ") ?? "pending" },
      {
        label: "Attendance Radius",
        value: company?.attendance_radius_meters ? `${company.attendance_radius_meters}m perimeter` : "Not set",
      },
    );

    if (["hr", "admin"].includes(profile.role)) {
      stats.push({ label: "Pending Leaves", value: `${pendingLeaves}` });
    }

    if (profile.role === "employee") {
      stats.push({ label: "Report Rule", value: "Submit before logout" });
    }

    return stats;
  }, [company, pendingLeaves, profile.role]);

  useEffect(() => {
    const allowedPaths = items.map((item) => `/app/${item.to}`);
    if (!allowedPaths.includes(location.pathname) && location.pathname !== "/app") {
      navigate(`/app/${items[0].to}`, { replace: true });
    }
  }, [items, location.pathname, navigate]);

  useEffect(() => {
    if (!["hr", "admin"].includes(profile.role)) return undefined;

    const loadPendingLeaves = async () => {
      const { count } = await supabase
        .from("leaves")
        .select("id", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .eq("status", "pending");
      setPendingLeaves(count ?? 0);
    };

    loadPendingLeaves();
    return undefined;
  }, [profile.company_id, profile.role, supabase, location.pathname]);

  const handleLogout = async () => {
    if (profile.role === "employee") {
      const today = getToday();
      const { data: attendanceRow } = await supabase
        .from("attendance")
        .select("check_in_time,check_out_time")
        .eq("user_id", profile.id)
        .eq("date", today)
        .maybeSingle();

      if (attendanceRow?.check_in_time && !attendanceRow?.check_out_time) {
        const { data: reportRow } = await supabase
          .from("daily_report_submissions")
          .select("id")
          .eq("user_id", profile.id)
          .eq("date", today)
          .maybeSingle();

        if (!reportRow) {
          window.alert("Complete today's daily report before logging out.");
          return;
        }
      }
    }

    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="sidebar-brand">
            <div className="brand-mark">WP</div>
            <div>
              <h1>WorkPulse</h1>
              <p>{profile.role === "super_admin" ? "Platform Operations" : company?.name ?? "Company Workspace"}</p>
            </div>
          </div>
          <div className="sidebar-user">
            <div>
              <strong>{profile.name}</strong>
              <span>{profile.role.replaceAll("_", " ").toUpperCase()}</span>
            </div>
            {profile.role !== "super_admin" ? (
              <span className={`status-pill ${company?.verification_status ?? "pending"}`}>
                {company?.verification_status?.replaceAll("_", " ") ?? "pending"}
              </span>
            ) : (
              <span className="status-pill verified">verified</span>
            )}
          </div>
          <div className="sidebar-section-label">Workspace Navigation</div>
          <nav className="sidebar-nav">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
              >
                <span>{item.label}</span>
                {item.badgeKey === "pendingLeaves" && pendingLeaves > 0 ? (
                  <span className="nav-badge">{pendingLeaves}</span>
                ) : null}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <button type="button" className="ghost-button full-width" onClick={refreshProfile}>
            Refresh
          </button>
          <button type="button" className="primary-button full-width" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="content-area">
        <header className="topbar">
          <div className="topbar-heading">
            <div className="eyebrow-label">{profile.role === "super_admin" ? "Platform workspace" : "Operations workspace"}</div>
            <h2>{activeItem?.label ?? company?.name ?? "WorkPulse"}</h2>
            <p>
              {profile.role === "super_admin"
                ? "Monitor company onboarding, verification, and platform-level operations."
                : "A focused command center for attendance, people workflows, and day-to-day company execution."}
            </p>
          </div>
          <div className="topbar-meta">
            <span>{getToday()}</span>
            <span>{profile.department}</span>
            <span>{profile.email}</span>
          </div>
        </header>

        <section className="workspace-strip">
          {workspaceStats.map((stat) => (
            <div key={stat.label} className="workspace-stat">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </section>

        <Outlet
          context={{
            supabase,
            profile,
            company,
            refreshProfile,
            pendingLeaves,
            setPendingLeaves,
          }}
        />
      </main>
    </div>
  );
}
