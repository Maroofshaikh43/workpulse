import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDate, formatLongDate, getToday } from "../utils";

function createRow(date = getToday(), serial = 1) {
  return {
    date,
    serial,
    workCode: "",
    platform: "",
    workDone: "",
    startTime: "",
    endTime: "",
    totalTimeSpent: "",
    completionStatus: "Completed",
    remarks: "",
  };
}

function parseStructuredTasks(value) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed?.format === "structured-daily-report" && Array.isArray(parsed.rows)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function parseHoursLabel(value) {
  if (!value) return 0;
  const normalized = String(value).trim().toLowerCase();
  const number = Number.parseFloat(normalized.replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function calculateDurationLabel(startTime, endTime) {
  if (!startTime || !endTime) return "";

  const start = new Date(`1970-01-01T${startTime}`);
  const end = new Date(`1970-01-01T${endTime}`);
  const diff = end.getTime() - start.getTime();
  if (diff <= 0) return "";

  const totalMinutes = Math.round(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) return `${hours}h`;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function DailyReport() {
  const { supabase, profile, company } = useOutletContext();
  const [submission, setSubmission] = useState(null);
  const [rows, setRows] = useState([createRow()]);
  const [summaryNote, setSummaryNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [driveOpened, setDriveOpened] = useState(false);

  const driveDestination = profile?.daily_report_drive_url || company?.google_drive_folder_url || "";

  const loadReportState = async () => {
    const today = getToday();
    const [submissionResponse, reportResponse] = await Promise.all([
      supabase
        .from("daily_report_submissions")
        .select("*")
        .eq("user_id", profile.id)
        .eq("date", today)
        .maybeSingle(),
      supabase
        .from("daily_reports")
        .select("*")
        .eq("user_id", profile.id)
        .eq("date", today)
        .maybeSingle(),
    ]);

    if (submissionResponse.error) {
      setError(submissionResponse.error.message);
      return;
    }

    if (reportResponse.error) {
      setError(reportResponse.error.message);
      return;
    }

    setSubmission(submissionResponse.data ?? null);
    setDriveOpened(Boolean(submissionResponse.data?.drive_link_opened_at));

    const structured = parseStructuredTasks(reportResponse.data?.tasks);
    if (structured) {
      setRows(
        structured.rows.map((row, index) => ({
          ...createRow(today, index + 1),
          ...row,
          serial: index + 1,
        })),
      );
      setSummaryNote(structured.summaryNote ?? "");
    } else if (reportResponse.data) {
      setRows([
        {
          ...createRow(today, 1),
          workDone: reportResponse.data.tasks ?? "",
          totalTimeSpent: reportResponse.data.hours ? `${reportResponse.data.hours}h` : "",
          completionStatus: reportResponse.data.mood ?? "Completed",
        },
      ]);
      setSummaryNote("");
    } else {
      setRows([createRow(today, 1)]);
      setSummaryNote("");
    }
  };

  useEffect(() => {
    loadReportState();
  }, [profile.id, supabase]);

  const status = useMemo(() => {
    if (!company?.google_drive_folder_url && !profile?.daily_report_drive_url) {
      return "Admin has not configured a company or employee Drive destination yet.";
    }
    if (!profile?.daily_report_drive_url) {
      return "Use the company report destination assigned by admin, then come back and submit today's report.";
    }
    return "Open your assigned Drive report from WorkPulse first, then come back and submit today's report.";
  }, [company, profile]);

  const totalHours = useMemo(
    () => rows.reduce((sum, row) => sum + parseHoursLabel(row.totalTimeSpent), 0),
    [rows],
  );

  const updateRow = (index, key, value) => {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

        const nextRow = { ...row, [key]: value };
        if (key === "startTime" || key === "endTime") {
          nextRow.totalTimeSpent = calculateDurationLabel(
            key === "startTime" ? value : nextRow.startTime,
            key === "endTime" ? value : nextRow.endTime,
          );
        }
        return nextRow;
      }),
    );
  };

  const addRow = () => {
    setRows((current) => [...current, createRow(getToday(), current.length + 1)]);
  };

  const removeRow = (index) => {
    setRows((current) =>
      current
        .filter((_, rowIndex) => rowIndex !== index)
        .map((row, rowIndex) => ({ ...row, serial: rowIndex + 1 })),
    );
  };

  const openAssignedDrive = async () => {
    setError("");
    setMessage("");

    if (!driveDestination) {
      setError("No Drive link has been assigned yet.");
      return;
    }

    const { error: upsertError } = await supabase.from("daily_report_submissions").upsert(
      {
        user_id: profile.id,
        company_id: profile.company_id,
        date: getToday(),
        drive_link: driveDestination,
        drive_link_opened_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    );

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setDriveOpened(true);
    window.open(driveDestination, "_blank", "noopener,noreferrer");
    setMessage("Drive report opened. After filling it, come back and submit today's report.");
    loadReportState();
  };

  const saveReport = async () => {
    setError("");
    setMessage("");
    setSaving(true);

    if (!driveOpened) {
      setError("Open your assigned Drive report from WorkPulse before submitting.");
      setSaving(false);
      return;
    }

    const validRows = rows
      .map((row, index) => ({
        ...row,
        serial: index + 1,
        date: row.date || getToday(),
      }))
      .filter((row) => row.platform || row.workDone || row.startTime || row.endTime || row.remarks || row.workCode);

    if (!validRows.length) {
      setError("Add at least one report row before saving.");
      setSaving(false);
      return;
    }

    const payload = {
      format: "structured-daily-report",
      summaryNote,
      rows: validRows,
    };

    const [reportResult, submissionResult] = await Promise.all([
      supabase.from("daily_reports").upsert(
        {
          user_id: profile.id,
          company_id: profile.company_id,
          date: getToday(),
          tasks: JSON.stringify(payload),
          hours: totalHours,
          mood: "submitted",
        },
        { onConflict: "user_id,date" },
      ),
      supabase.from("daily_report_submissions").upsert(
        {
          user_id: profile.id,
          company_id: profile.company_id,
          date: getToday(),
          drive_link: driveDestination || null,
          drive_link_opened_at: submission?.drive_link_opened_at ?? new Date().toISOString(),
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date" },
      ),
    ]);

    setSaving(false);

    if (reportResult.error) {
      setError(reportResult.error.message);
      return;
    }

    if (submissionResult.error) {
      setError(submissionResult.error.message);
      return;
    }

    setMessage("Today's structured daily report has been saved successfully.");
    loadReportState();
  };

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="section-header">
          <h2>Structured Daily Report</h2>
          <p>{formatLongDate()}.</p>
        </div>
        <div className="mini-card stack">
          <strong>How this works</strong>
          <p>1. Open your assigned Drive report from WorkPulse.</p>
          <p>2. Fill your report details in Drive and come back here.</p>
          <p>3. Save the structured report in WorkPulse to mark today's report as submitted.</p>
          <p>{status}</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        {!!message && <div className="alert success">{message}</div>}
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Today's Report Sheet</h2>
          <p>Use the same structure your team uses in Google Sheets.</p>
        </div>
        <div className="table-wrap">
          <table className="report-entry-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sl No</th>
                <th>Work Code / Project ID</th>
                <th>Platform</th>
                <th>Work Done</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Total Time Spent</th>
                <th>Completion Status</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`report-row-${index}`}>
                  <td>
                    <input type="date" value={row.date} onChange={(event) => updateRow(index, "date", event.target.value)} />
                  </td>
                  <td>{row.serial}</td>
                  <td>
                    <input value={row.workCode} onChange={(event) => updateRow(index, "workCode", event.target.value)} />
                  </td>
                  <td>
                    <input value={row.platform} onChange={(event) => updateRow(index, "platform", event.target.value)} />
                  </td>
                  <td>
                    <textarea
                      rows="3"
                      value={row.workDone}
                      onChange={(event) => updateRow(index, "workDone", event.target.value)}
                    />
                  </td>
                  <td>
                    <input type="time" value={row.startTime} onChange={(event) => updateRow(index, "startTime", event.target.value)} />
                  </td>
                  <td>
                    <input type="time" value={row.endTime} onChange={(event) => updateRow(index, "endTime", event.target.value)} />
                  </td>
                  <td>
                    <input
                      value={row.totalTimeSpent}
                      onChange={(event) => updateRow(index, "totalTimeSpent", event.target.value)}
                      placeholder="4h"
                    />
                  </td>
                  <td>
                    <select
                      value={row.completionStatus}
                      onChange={(event) => updateRow(index, "completionStatus", event.target.value)}
                    >
                      <option>Completed</option>
                      <option>In Progress</option>
                      <option>Not Completed</option>
                      <option>Need Confirmation</option>
                    </select>
                  </td>
                  <td>
                    <input value={row.remarks} onChange={(event) => updateRow(index, "remarks", event.target.value)} />
                  </td>
                  <td>
                    <button type="button" className="link-button danger" onClick={() => removeRow(index)} disabled={rows.length === 1}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="stack">
          <label>
            Summary Note
            <textarea
              rows="4"
              value={summaryNote}
              onChange={(event) => setSummaryNote(event.target.value)}
              placeholder="Add any extra summary, blocker, or follow-up note for your admin."
            />
          </label>
          <div className="grid-two responsive">
            <div className="mini-card">
              <strong>Total Logged Time</strong>
              <p>{totalHours.toFixed(1)} hours</p>
            </div>
            <div className="mini-card">
              <strong>Drive Destination</strong>
              <p>{driveDestination || "No Drive destination configured yet."}</p>
            </div>
          </div>
          <div className="mini-card">
            <strong>Drive Access Status</strong>
            <p>
              {driveOpened
                ? "Drive link opened in this session. You can now submit today's daily report."
                : "Submit stays locked until you open the assigned Drive link from here."}
            </p>
          </div>
          <div className="row-end">
            <button type="button" className="ghost-button" onClick={openAssignedDrive} disabled={!driveDestination}>
              Open Assigned Drive Report
            </button>
            <button type="button" className="ghost-button" onClick={addRow}>
              Add Report Row
            </button>
            <button type="button" className="primary-button" onClick={saveReport} disabled={saving || !driveOpened}>
              {saving ? "Saving..." : "Save Today's Report"}
            </button>
          </div>
          <div className="mini-card">
            <strong>Today's Submission</strong>
            <p>
              {submission
                ? `Saved on ${formatDate(submission.submitted_at)} and ready for admin review.`
                : "Not saved yet. Checkout remains blocked until you save today's report."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
