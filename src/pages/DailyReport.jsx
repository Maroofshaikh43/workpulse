import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatLongDate, formatTime, getToday } from "../utils";

const STATUS_OPTIONS = ["Completed", "In Progress", "Blocked", "Not Started"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];

const STATUS_META = {
  "Completed":   { cls: "present",  color: "#059669" },
  "In Progress": { cls: "pending",  color: "#d97706" },
  "Blocked":     { cls: "rejected", color: "#dc2626" },
  "Not Started": { cls: "",         color: "#94a3b8" },
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function createTask() {
  return { id: uid(), title: "", category: "", status: "In Progress", priority: "Medium", timeSpent: "", description: "" };
}

function parseReport(value) {
  if (!value) return null;
  try {
    const p = JSON.parse(value);
    if (p?.format === "v2-task-report" && Array.isArray(p.tasks)) return p;
    if (p?.format === "structured-daily-report" && Array.isArray(p.rows)) {
      return {
        format: "v2-task-report",
        tasks: p.rows.map((r) => ({
          id: uid(),
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
    /* ignore parse errors */
  }
  return null;
}

function fmtTime(date) {
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function DailyReport() {
  const { supabase, profile } = useOutletContext();
  const today = getToday();

  const [tasks, setTasks] = useState([createTask()]);
  const [summaryNote, setSummaryNote] = useState("");
  const [submission, setSubmission] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [checkOutDone, setCheckOutDone] = useState(false);
  const [checkOutTime, setCheckOutTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [submissionRes, reportRes, attendanceRes] = await Promise.all([
      supabase.from("daily_report_submissions").select("*").eq("user_id", profile.id).eq("date", today).maybeSingle(),
      supabase.from("daily_reports").select("*").eq("user_id", profile.id).eq("date", today).maybeSingle(),
      supabase.from("attendance").select("check_in_time, check_out_time").eq("user_id", profile.id).eq("date", today).maybeSingle(),
    ]);

    setSubmission(submissionRes.data ?? null);
    setAttendance(attendanceRes.data ?? null);

    if (attendanceRes.data?.check_out_time) {
      setCheckOutDone(true);
      setCheckOutTime(attendanceRes.data.check_out_time.slice(0, 5));
    }

    const parsed = parseReport(reportRes.data?.tasks);
    if (parsed) {
      setTasks(parsed.tasks.length ? parsed.tasks : [createTask()]);
      setSummaryNote(parsed.summaryNote ?? "");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [profile.id]);

  const totalHours = useMemo(
    () => tasks.reduce((sum, t) => sum + (parseFloat(t.timeSpent) || 0), 0),
    [tasks],
  );

  const statusCounts = useMemo(() => {
    const counts = { Completed: 0, "In Progress": 0, Blocked: 0, "Not Started": 0 };
    for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
    return counts;
  }, [tasks]);

  const isSubmitted = Boolean(submission?.submitted_at);
  const isCheckedOut = checkOutDone || Boolean(attendance?.check_out_time);
  const canCheckOut = isSubmitted && attendance?.check_in_time && !isCheckedOut;

  const updateTask = (id, key, value) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, [key]: value } : t)));

  const addTask = () => setTasks((prev) => [...prev, createTask()]);

  const removeTask = (id) => {
    if (tasks.length <= 1) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const submitReport = async () => {
    setError("");
    setMessage("");
    setSaving(true);

    const validTasks = tasks.filter((t) => t.title.trim() || t.description.trim());
    if (!validTasks.length) {
      setError("Please add at least one task with a title before submitting.");
      setSaving(false);
      return;
    }

    const payload = { format: "v2-task-report", tasks: validTasks, summaryNote };
    const now = new Date().toISOString();

    const [reportRes, subRes] = await Promise.all([
      supabase.from("daily_reports").upsert(
        { user_id: profile.id, company_id: profile.company_id, date: today, tasks: JSON.stringify(payload), hours: totalHours, mood: "submitted" },
        { onConflict: "user_id,date" },
      ),
      supabase.from("daily_report_submissions").upsert(
        { user_id: profile.id, company_id: profile.company_id, date: today, tasks: JSON.stringify(payload), submitted_at: now },
        { onConflict: "user_id,date" },
      ),
    ]);

    setSaving(false);
    if (reportRes.error || subRes.error) {
      setError(reportRes.error?.message || subRes.error?.message);
      return;
    }
    setMessage("Report submitted. You can now check out.");
    await loadData();
  };

  const checkOut = async () => {
    setError("");
    setCheckingOut(true);
    const now = new Date();
    const { error: updateError } = await supabase
      .from("attendance")
      .update({ check_out_time: now.toTimeString().slice(0, 8) })
      .eq("user_id", profile.id)
      .eq("date", today);

    setCheckingOut(false);
    if (updateError) { setError(updateError.message); return; }
    setCheckOutDone(true);
    setCheckOutTime(fmtTime(now));
    setMessage(`Checked out at ${fmtTime(now)}. Great work today!`);
    await loadData();
  };

  if (loading) {
    return (
      <div className="panel empty-state attendance-model-loading">
        <div className="attendance-spinner" />
        <p>Loading your report...</p>
      </div>
    );
  }

  return (
    <section className="page-stack">

      {/* ── HEADER ── */}
      <div className="panel">
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2>Daily Work Report</h2>
            <p style={{ marginTop: 4 }}>{formatLongDate()} — Log your tasks for today</p>
          </div>
          {isSubmitted && (
            <span className="status-pill present">
              ✓ Submitted {new Date(submission.submitted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        {!!error && <div className="alert error" style={{ marginTop: 16 }}>{error}</div>}
        {!!message && <div className="alert success" style={{ marginTop: 16 }}>{message}</div>}
      </div>

      {/* ── TASK CARDS ── */}
      <div className="panel">
        <div className="section-header">
          <h2>Tasks</h2>
          <p>Log each task you worked on today — title, status, and time spent are most important.</p>
        </div>

        <div className="stack">
          {tasks.map((task, index) => (
            <div key={task.id} className="dr-task-card">
              {/* card header */}
              <div className="dr-task-card-header">
                <span className="dr-task-number">Task {index + 1}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`status-pill ${STATUS_META[task.status]?.cls ?? ""}`}>{task.status}</span>
                  <span className={`status-pill ${task.priority === "High" ? "rejected" : task.priority === "Low" ? "present" : "pending"}`}>{task.priority}</span>
                  <button type="button" className="link-button danger" onClick={() => removeTask(task.id)} disabled={tasks.length === 1}>
                    Remove
                  </button>
                </div>
              </div>

              {/* title */}
              <div className="dr-field">
                <label>Task Title *</label>
                <input
                  value={task.title}
                  onChange={(e) => updateTask(task.id, "title", e.target.value)}
                  placeholder="What did you work on? (e.g. Implement login page, Fix bug #42)"
                />
              </div>

              {/* row: category + status + priority */}
              <div className="dr-grid-3">
                <div className="dr-field">
                  <label>Category / Project</label>
                  <input
                    value={task.category}
                    onChange={(e) => updateTask(task.id, "category", e.target.value)}
                    placeholder="e.g. Frontend, API, Design"
                  />
                </div>
                <div className="dr-field">
                  <label>Status</label>
                  <select value={task.status} onChange={(e) => updateTask(task.id, "status", e.target.value)}>
                    {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="dr-field">
                  <label>Priority</label>
                  <select value={task.priority} onChange={(e) => updateTask(task.id, "priority", e.target.value)}>
                    {PRIORITY_OPTIONS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* row: time + description */}
              <div className="dr-grid-2">
                <div className="dr-field">
                  <label>Time Spent (hours)</label>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={task.timeSpent}
                    onChange={(e) => updateTask(task.id, "timeSpent", e.target.value)}
                    placeholder="e.g. 2.5"
                  />
                </div>
                <div className="dr-field">
                  <label>Notes / Details</label>
                  <input
                    value={task.description}
                    onChange={(e) => updateTask(task.id, "description", e.target.value)}
                    placeholder="Brief details, blockers, or what's next"
                  />
                </div>
              </div>
            </div>
          ))}

          <button type="button" className="ghost-button" onClick={addTask} style={{ alignSelf: "flex-start" }}>
            + Add Another Task
          </button>
        </div>
      </div>

      {/* ── SUMMARY + SUBMIT ── */}
      <div className="panel">
        <div className="section-header">
          <h2>End of Day Summary</h2>
          <p>Mention blockers, key achievements, or plans for tomorrow.</p>
        </div>

        <label>
          Summary Note
          <textarea
            rows={3}
            value={summaryNote}
            onChange={(e) => setSummaryNote(e.target.value)}
            placeholder="Today I completed… Blockers: … Tomorrow I plan to…"
          />
        </label>

        {/* stats bar */}
        <div className="dr-stats-bar">
          <div className="dr-stat">
            <strong>{tasks.length}</strong>
            <span>Total Tasks</span>
          </div>
          <div className="dr-stat">
            <strong>{totalHours.toFixed(1)}h</strong>
            <span>Hours Logged</span>
          </div>
          <div className="dr-stat" style={{ "--stat-color": "#059669" }}>
            <strong style={{ color: "#059669" }}>{statusCounts.Completed}</strong>
            <span>Completed</span>
          </div>
          <div className="dr-stat">
            <strong style={{ color: "#d97706" }}>{statusCounts["In Progress"]}</strong>
            <span>In Progress</span>
          </div>
          {statusCounts.Blocked > 0 && (
            <div className="dr-stat">
              <strong style={{ color: "#dc2626" }}>{statusCounts.Blocked}</strong>
              <span>Blocked</span>
            </div>
          )}
        </div>

        <div className="row-end" style={{ marginTop: 20 }}>
          <button type="button" className="primary-button" onClick={submitReport} disabled={saving}>
            {saving ? "Submitting…" : isSubmitted ? "Re-submit Report" : "Submit Daily Report"}
          </button>
        </div>
      </div>

      {/* ── CHECKOUT ── */}
      {isSubmitted && (
        <div className={`dr-checkout-card${isCheckedOut ? " done" : ""}`}>
          <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
            <div>
              <strong style={{ fontSize: 15 }}>
                {isCheckedOut ? `Checked out at ${checkOutTime} ✓` : "Ready to check out"}
              </strong>
              <p style={{ marginTop: 6 }}>
                {isCheckedOut
                  ? "Your day is complete. Your report has been saved and submitted to HR."
                  : attendance?.check_in_time
                    ? `You checked in at ${formatTime(attendance.check_in_time)}. Click Check Out to end your day.`
                    : "No check-in record found for today. Please check in first from the Attendance page."}
              </p>
            </div>
            {canCheckOut && (
              <button type="button" className="primary-button" onClick={checkOut} disabled={checkingOut}>
                {checkingOut ? "Checking out…" : "Check Out"}
              </button>
            )}
            {isCheckedOut && <span className="status-pill present">Day Complete</span>}
          </div>
        </div>
      )}

    </section>
  );
}
