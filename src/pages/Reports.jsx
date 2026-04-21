import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { formatDate, getToday } from "../utils";

const STATUS_COLORS = {
  "Completed":   "#059669",
  "In Progress": "#d97706",
  "Blocked":     "#dc2626",
  "Not Started": "#94a3b8",
};

const PRIORITY_COLORS = {
  "High":   { bg: "rgba(220,38,38,0.08)",   text: "#dc2626",  border: "rgba(220,38,38,0.24)"   },
  "Medium": { bg: "rgba(217,119,6,0.08)",   text: "#d97706",  border: "rgba(217,119,6,0.24)"   },
  "Low":    { bg: "rgba(5,150,105,0.08)",   text: "#059669",  border: "rgba(5,150,105,0.24)"   },
};

function parseReport(value) {
  if (!value) return null;
  try {
    const p = JSON.parse(value);
    if (p?.format === "v2-task-report" && Array.isArray(p.tasks)) return p;
    if (p?.format === "structured-daily-report" && Array.isArray(p.rows)) {
      return {
        format: "v2-task-report",
        tasks: p.rows.map((r) => ({
          title: r.workCode || r.workDone?.slice(0, 60) || "Task",
          category: r.platform || "",
          status: r.completionStatus || "Completed",
          priority: "Medium",
          timeSpent: r.totalTimeSpent || "",
          description: r.workDone || r.remarks || "",
        })),
        summaryNote: p.summaryNote || "",
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function StatusDot({ status }) {
  const color = STATUS_COLORS[status] ?? "#94a3b8";
  return (
    <span style={{
      display: "inline-block",
      width: 8, height: 8,
      borderRadius: "50%",
      background: color,
      flexShrink: 0,
    }} />
  );
}

export default function Reports() {
  const { supabase, profile } = useOutletContext();
  const [employees, setEmployees] = useState([]);
  const [reports, setReports] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState("");

  const loadReports = async () => {
    const [empRes, repRes, subRes] = await Promise.all([
      supabase.from("users").select("id,name,email,department").eq("company_id", profile.company_id).order("name"),
      supabase.from("daily_reports").select("*").eq("company_id", profile.company_id).order("date", { ascending: false }),
      supabase.from("daily_report_submissions").select("*").eq("company_id", profile.company_id).order("submitted_at", { ascending: false }),
    ]);
    if (empRes.error || repRes.error || subRes.error) {
      setError(empRes.error?.message || repRes.error?.message || subRes.error?.message);
      return;
    }
    setEmployees(empRes.data ?? []);
    setReports(repRes.data ?? []);
    setSubmissions(subRes.data ?? []);
  };

  useEffect(() => { loadReports(); }, [profile.company_id]);

  const enrichedReports = useMemo(() => {
    const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));
    const subMap = Object.fromEntries(submissions.map((s) => [`${s.user_id}:${s.date}`, s]));
    return reports.map((r) => ({
      ...r,
      employee: empMap[r.user_id] ?? null,
      submission: subMap[`${r.user_id}:${r.date}`] ?? null,
      parsed: parseReport(r.tasks),
    }));
  }, [employees, reports, submissions]);

  const dateReports = useMemo(
    () => enrichedReports.filter((r) => r.date === selectedDate),
    [enrichedReports, selectedDate],
  );

  const allTasks = useMemo(
    () => dateReports.flatMap((r) => r.parsed?.tasks ?? []),
    [dateReports],
  );

  // Donut chart: task status breakdown
  const statusChartData = useMemo(() => {
    const counts = {};
    for (const t of allTasks) counts[t.status] = (counts[t.status] || 0) + 1;
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] ?? "#94a3b8" }))
      .sort((a, b) => b.value - a.value);
  }, [allTasks]);

  // Bar chart: hours per employee for selected date
  const hoursChartData = useMemo(
    () =>
      dateReports
        .filter((r) => r.parsed)
        .map((r) => ({
          name: r.employee?.name?.split(" ")[0] ?? "—",
          hours: Number(
            r.parsed.tasks.reduce((s, t) => s + (parseFloat(t.timeSpent) || 0), 0).toFixed(1),
          ),
          completed: r.parsed.tasks.filter((t) => t.status === "Completed").length,
          total: r.parsed.tasks.length,
        }))
        .sort((a, b) => b.hours - a.hours),
    [dateReports],
  );

  // Summary stats
  const submittedCount = dateReports.filter((r) => r.submission?.submitted_at).length;
  const avgHours =
    hoursChartData.length
      ? (hoursChartData.reduce((s, d) => s + d.hours, 0) / hoursChartData.length).toFixed(1)
      : "—";
  const completionRate =
    allTasks.length
      ? Math.round((allTasks.filter((t) => t.status === "Completed").length / allTasks.length) * 100)
      : 0;

  const selectedReport = selectedUserId
    ? dateReports.find((r) => r.user_id === selectedUserId) ?? null
    : dateReports[0] ?? null;

  const selectedTasks = selectedReport?.parsed?.tasks ?? [];
  const selectedHours = selectedTasks.reduce((s, t) => s + (parseFloat(t.timeSpent) || 0), 0);

  return (
    <section className="page-stack">

      {/* ── HEADER + STATS ── */}
      <div className="panel">
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h2>Daily Reports</h2>
            <p>Team work overview, task breakdown and productivity charts</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ textTransform: "none", letterSpacing: 0, fontSize: 13, color: "var(--text-secondary)", marginBottom: 0 }}>
              View date:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setSelectedUserId(""); }}
              style={{ width: 160 }}
            />
          </div>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        <div className="stat-grid">
          <div className="stat-card">
            <span>Submitted</span>
            <strong>{submittedCount} / {employees.length}</strong>
          </div>
          <div className="stat-card">
            <span>Total Tasks</span>
            <strong>{allTasks.length}</strong>
          </div>
          <div className="stat-card">
            <span>Avg Hours</span>
            <strong>{avgHours}h</strong>
          </div>
          <div className="stat-card">
            <span>Completion Rate</span>
            <strong style={{ color: completionRate >= 80 ? "#059669" : completionRate >= 50 ? "#d97706" : "#dc2626" }}>
              {completionRate}%
            </strong>
          </div>
        </div>
      </div>

      {/* ── CHARTS ── */}
      {allTasks.length > 0 && (
        <div className="grid-two responsive">
          {/* Donut: status breakdown */}
          <div className="panel">
            <div className="section-header">
              <h2>Task Status Breakdown</h2>
              <p>{allTasks.length} tasks across {dateReports.length} reports for {formatDate(selectedDate)}</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={105}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                  labelLine={false}
                >
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value} tasks`, name]} />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar: hours by employee */}
          <div className="panel">
            <div className="section-header">
              <h2>Hours Logged by Employee</h2>
              <p>Total hours submitted for {formatDate(selectedDate)}</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={hoursChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
                  formatter={(v, _n, props) => [`${v}h (${props.payload.completed}/${props.payload.total} tasks done)`, "Hours"]}
                />
                <Bar dataKey="hours" fill="#6366f1" radius={[8, 8, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── REPORT LIST + DETAIL ── */}
      <div className="grid-two responsive">

        {/* left: employee list */}
        <div className="panel">
          <div className="section-header">
            <h2>Submissions</h2>
            <p>{dateReports.length} report{dateReports.length !== 1 ? "s" : ""} for {formatDate(selectedDate)}</p>
          </div>
          <div className="message-list">
            {dateReports.map((r) => {
              const tasks = r.parsed?.tasks ?? [];
              const completed = tasks.filter((t) => t.status === "Completed").length;
              const hours = tasks.reduce((s, t) => s + (parseFloat(t.timeSpent) || 0), 0);
              const isActive = (selectedUserId ? r.user_id === selectedUserId : r.user_id === dateReports[0]?.user_id);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`message-card report-select-card${isActive ? " active" : ""}`}
                  onClick={() => setSelectedUserId(r.user_id)}
                >
                  <div className="message-meta" style={{ marginBottom: 4 }}>
                    <strong>{r.employee?.name ?? r.user_id}</strong>
                    {r.submission?.submitted_at
                      ? <span className="status-pill present" style={{ fontSize: 11, padding: "2px 8px" }}>Submitted</span>
                      : <span className="status-pill pending" style={{ fontSize: 11, padding: "2px 8px" }}>Draft</span>}
                  </div>
                  <p style={{ fontSize: 12 }}>{r.employee?.department ?? "No department"}</p>
                  <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tasks.length} tasks</span>
                    <span style={{ fontSize: 12, color: "#059669" }}>{completed} done</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{hours.toFixed(1)}h</span>
                  </div>
                </button>
              );
            })}
            {!dateReports.length && (
              <div className="empty-state">No reports submitted for this date.</div>
            )}
          </div>
        </div>

        {/* right: detail */}
        <div className="panel">
          {selectedReport ? (
            <div className="stack">
              <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h2>{selectedReport.employee?.name ?? "Employee"}</h2>
                  <p style={{ marginTop: 2 }}>
                    {selectedReport.employee?.department ?? ""} · {formatDate(selectedReport.date)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="status-pill" style={{ fontSize: 12 }}>
                    {selectedTasks.length} tasks
                  </span>
                  <span className="status-pill" style={{ fontSize: 12 }}>
                    {selectedHours.toFixed(1)}h logged
                  </span>
                  {selectedReport.submission?.submitted_at && (
                    <span className="status-pill present" style={{ fontSize: 12 }}>
                      Submitted {new Date(selectedReport.submission.submitted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>

              {/* task cards */}
              {selectedTasks.length > 0 ? (
                selectedTasks.map((task, i) => {
                  const statusColor = STATUS_COLORS[task.status] ?? "#94a3b8";
                  const pColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.Medium;
                  return (
                    <div key={i} className="dr-task-view-card">
                      <div className="row-between" style={{ gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <StatusDot status={task.status} />
                          <strong style={{ fontSize: 14 }}>{task.title || "Untitled Task"}</strong>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {task.priority && (
                            <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: pColor.bg, color: pColor.text, border: `1px solid ${pColor.border}` }}>
                              {task.priority}
                            </span>
                          )}
                          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: statusColor + "18", color: statusColor, border: `1px solid ${statusColor}40` }}>
                            {task.status}
                          </span>
                        </div>
                      </div>
                      {task.category && (
                        <p style={{ fontSize: 12, color: "var(--primary)", marginBottom: 4 }}>
                          {task.category}
                        </p>
                      )}
                      {task.description && (
                        <p style={{ fontSize: 13, marginBottom: 4 }}>{task.description}</p>
                      )}
                      {task.timeSpent && (
                        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>⏱ {task.timeSpent}h</p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="empty-state" style={{ padding: 20 }}>No structured tasks in this report.</div>
              )}

              {/* summary note */}
              {selectedReport.parsed?.summaryNote ? (
                <div className="mini-card">
                  <strong>Summary Note</strong>
                  <p style={{ marginTop: 6 }}>{selectedReport.parsed.summaryNote}</p>
                </div>
              ) : null}

              {/* fallback for old format */}
              {!selectedReport.parsed && selectedReport.tasks && (
                <div className="mini-card">
                  <strong>Report (legacy format)</strong>
                  <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{selectedReport.tasks}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">Select a report to view task details.</div>
          )}
        </div>

      </div>
    </section>
  );
}
