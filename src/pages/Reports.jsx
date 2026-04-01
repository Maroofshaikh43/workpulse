import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { createCsv, downloadTextFile, formatDate, getToday } from "../utils";

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

export default function Reports() {
  const { supabase, profile, company } = useOutletContext();
  const [employees, setEmployees] = useState([]);
  const [reports, setReports] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [error, setError] = useState("");

  const loadReports = async () => {
    const [employeeResponse, reportResponse, submissionResponse] = await Promise.all([
      supabase
        .from("users")
        .select("id,name,email,department,created_at,daily_report_drive_url")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("daily_reports")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("date", { ascending: false }),
      supabase
        .from("daily_report_submissions")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("submitted_at", { ascending: false }),
    ]);

    if (employeeResponse.error) {
      setError(employeeResponse.error.message);
      return;
    }
    if (reportResponse.error) {
      setError(reportResponse.error.message);
      return;
    }
    if (submissionResponse.error) {
      setError(submissionResponse.error.message);
      return;
    }

    setEmployees(employeeResponse.data ?? []);
    setReports(reportResponse.data ?? []);
    setSubmissions(submissionResponse.data ?? []);
    if ((reportResponse.data ?? [])[0]) {
      setSelectedReportId((current) => current || reportResponse.data[0].id);
    }
  };

  useEffect(() => {
    loadReports();
  }, [profile.company_id, supabase]);

  const employeeMap = useMemo(
    () =>
      employees.reduce((accumulator, employee) => {
        accumulator[employee.id] = employee;
        return accumulator;
      }, {}),
    [employees],
  );

  const reportCards = useMemo(
    () =>
      reports.map((report) => {
        const submission = submissions.find(
          (item) => item.user_id === report.user_id && item.date === report.date,
        );
        const structured = parseStructuredTasks(report.tasks);

        return {
          ...report,
          employee: employeeMap[report.user_id] ?? null,
          submission,
          rowCount: structured?.rows?.length ?? 1,
          summaryNote: structured?.summaryNote ?? "",
          rows: structured?.rows ?? [],
        };
      }),
    [employeeMap, reports, submissions],
  );

  const selectedReport =
    reportCards.find((report) => report.id === selectedReportId) ?? reportCards[0] ?? null;

  const exportCsv = () => {
    const csv = createCsv(
      reportCards.flatMap((report) => {
        if (report.rows.length) {
          return report.rows.map((row) => ({
            employee: report.employee?.name ?? report.user_id,
            department: report.employee?.department ?? "",
            date: row.date,
            serial: row.serial,
            work_code: row.workCode,
            platform: row.platform,
            work_done: row.workDone,
            start_time: row.startTime,
            end_time: row.endTime,
            total_time_spent: row.totalTimeSpent,
            completion_status: row.completionStatus,
            remarks: row.remarks,
            drive_destination: report.submission?.drive_link ?? "",
          }));
        }

        return [
          {
            employee: report.employee?.name ?? report.user_id,
            department: report.employee?.department ?? "",
            date: report.date,
            serial: 1,
            work_code: "",
            platform: "",
            work_done: report.tasks,
            start_time: "",
            end_time: "",
            total_time_spent: `${report.hours}h`,
            completion_status: report.mood,
            remarks: "",
            drive_destination: report.submission?.drive_link ?? "",
          },
        ];
      }),
    );
    downloadTextFile(csv, `daily-reports-${getToday()}.csv`);
  };

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="section-header">
          <h2>Employee Daily Reports</h2>
          <p>Review structured daily reports submitted by employees and track the linked Drive destination.</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        <div className="grid-two responsive">
          <div className="mini-card report-banner">
            <strong>Company Drive Folder</strong>
            <span>{company?.google_drive_folder_url ?? "Not configured yet."}</span>
          </div>
          <div className="mini-card report-banner">
            <strong>Total Submitted Reports</strong>
            <span>{reportCards.length}</span>
          </div>
        </div>
        <div className="row-end">
          <button type="button" className="ghost-button" onClick={exportCsv}>
            Export Daily Reports CSV
          </button>
        </div>
      </div>

      <div className="grid-two responsive">
        <div className="panel">
          <div className="section-header">
            <h2>Recent Submissions</h2>
            <p>Select any employee report to inspect its rows.</p>
          </div>
          <div className="message-list">
            {reportCards.map((report) => (
              <button
                key={report.id}
                type="button"
                className={`message-card report-select-card${selectedReport?.id === report.id ? " active" : ""}`}
                onClick={() => setSelectedReportId(report.id)}
              >
                <div className="message-meta">
                  <strong>{report.employee?.name ?? report.user_id}</strong>
                  <span>{formatDate(report.date)}</span>
                </div>
                <p>{report.employee?.department ?? "No department"}</p>
                <small>{report.rowCount} entries</small>
              </button>
            ))}
            {!reportCards.length && <div className="empty-state">No daily reports have been submitted yet.</div>}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h2>Report Details</h2>
            <p>Structured entries submitted by the selected employee.</p>
          </div>
          {selectedReport ? (
            <div className="stack">
              <div className="grid-two responsive">
                <div className="mini-card">
                  <strong>Employee</strong>
                  <p>{selectedReport.employee?.name ?? selectedReport.user_id}</p>
                  <p>{selectedReport.employee?.email ?? ""}</p>
                  <p>{selectedReport.employee?.department ?? ""}</p>
                </div>
                <div className="mini-card">
                  <strong>Submission</strong>
                  <p>Date: {formatDate(selectedReport.date)}</p>
                  <p>Total Hours: {selectedReport.hours}</p>
                  <p>Drive Destination: {selectedReport.submission?.drive_link ?? "Not linked"}</p>
                  <p>Drive Opened: {selectedReport.submission?.drive_link_opened_at ? "Yes" : "No"}</p>
                  <p>Submitted: {selectedReport.submission?.submitted_at ? "Yes" : "No"}</p>
                </div>
              </div>

              {selectedReport.submission?.drive_link ? (
                <div className="row-end">
                  <a
                    className="ghost-button"
                    href={selectedReport.submission.drive_link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Employee Drive Report
                  </a>
                </div>
              ) : null}

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
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.rows.length ? (
                      selectedReport.rows.map((row, index) => (
                        <tr key={`selected-row-${index}`}>
                          <td>{formatDate(row.date)}</td>
                          <td>{row.serial}</td>
                          <td>{row.workCode || "--"}</td>
                          <td>{row.platform || "--"}</td>
                          <td>{row.workDone || "--"}</td>
                          <td>{row.startTime || "--"}</td>
                          <td>{row.endTime || "--"}</td>
                          <td>{row.totalTimeSpent || "--"}</td>
                          <td>{row.completionStatus || "--"}</td>
                          <td>{row.remarks || "--"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="10">{selectedReport.tasks}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedReport.summaryNote ? (
                <div className="mini-card">
                  <strong>Summary Note</strong>
                  <p>{selectedReport.summaryNote}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">Choose a submitted report to inspect its entries.</div>
          )}
        </div>
      </div>
    </section>
  );
}
