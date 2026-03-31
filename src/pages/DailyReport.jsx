import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDate, formatLongDate, getToday } from "../utils";

export default function DailyReport() {
  const { supabase, profile, company } = useOutletContext();
  const [submission, setSubmission] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSubmission = async () => {
    const { data, error: submissionError } = await supabase
      .from("daily_report_submissions")
      .select("*")
      .eq("user_id", profile.id)
      .eq("date", getToday())
      .maybeSingle();

    if (submissionError) {
      setError(submissionError.message);
      return;
    }

    setSubmission(data ?? null);
  };

  useEffect(() => {
    loadSubmission();
  }, []);

  const status = useMemo(() => {
    if (!company?.google_drive_folder_url && !profile?.daily_report_drive_url) {
      return "Admin has not configured company or employee Google Drive links yet.";
    }
    if (!profile?.daily_report_drive_url) {
      return "Admin still needs to assign your personal daily report Drive link.";
    }
    return "Open your dedicated report document in Google Drive and update it using your registered work email.";
  }, [company, profile]);

  const markComplete = async () => {
    setError("");
    setMessage("");
    setSaving(true);

    if (!profile?.daily_report_drive_url) {
      setError("No employee Drive report link has been assigned yet.");
      setSaving(false);
      return;
    }

    const { error: upsertError } = await supabase.from("daily_report_submissions").upsert(
      {
        user_id: profile.id,
        company_id: profile.company_id,
        date: getToday(),
        drive_link: profile.daily_report_drive_url,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    );
    setSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setMessage("Today's report marked complete. You can now check out and log out.");
    loadSubmission();
  };

  return (
    <section className="grid-two responsive">
      <div className="panel">
        <div className="section-header">
          <h2>Google Drive Reporting</h2>
          <p>{formatLongDate()}.</p>
        </div>
        <div className="mini-card stack">
          <strong>How this works</strong>
          <p>1. Admin creates the company Drive folder.</p>
          <p>2. Admin shares your report document with your registered work email.</p>
          <p>3. You update the report directly in Drive every day.</p>
          <p>{status}</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        {!!message && <div className="alert success">{message}</div>}
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Your Links</h2>
          <p>Use your work email when opening these links so Drive access stays restricted correctly.</p>
        </div>
        <div className="stack">
          <div className="mini-card">
            <strong>Company Reports Folder</strong>
            <p>{company?.google_drive_folder_url ?? "Not configured yet."}</p>
          </div>
          <div className="mini-card">
            <strong>Your Daily Report Document</strong>
            <p>{profile?.daily_report_drive_url ?? "Not assigned yet."}</p>
          </div>
          <div className="mini-card">
            <strong>Report Date</strong>
            <p>{formatLongDate()}</p>
          </div>
          <div className="mini-card">
            <strong>Today's Submission</strong>
            <p>
              {submission
                ? `Completed on ${formatDate(submission.submitted_at)}`
                : "Not completed yet. Checkout and logout are blocked until you finish this."}
            </p>
          </div>
          <div className="row-end">
            {company?.google_drive_folder_url && (
              <a className="ghost-button" href={company.google_drive_folder_url} target="_blank" rel="noreferrer">
                Open Company Folder
              </a>
            )}
            {profile?.daily_report_drive_url && (
              <a className="primary-button" href={profile.daily_report_drive_url} target="_blank" rel="noreferrer">
                Open My Drive Report
              </a>
            )}
            <button type="button" className="ghost-button" onClick={markComplete} disabled={!profile?.daily_report_drive_url || saving}>
              {saving ? "Saving..." : "Mark Today's Report Complete"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
