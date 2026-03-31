import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDateTime } from "../utils";

export default function Notifications() {
  const { supabase, profile, company } = useOutletContext();
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState({
    email_enabled: true,
    in_app_enabled: true,
    attendance_alerts: true,
    hr_alerts: true,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [readingId, setReadingId] = useState("");

  const loadData = async () => {
    const [notificationResponse, preferenceResponse] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .eq("recipient_user_id", profile.id)
        .order("created_at", { ascending: false }),
      supabase.from("notification_preferences").select("*").eq("user_id", profile.id).maybeSingle(),
    ]);

    if (notificationResponse.error) {
      setError(notificationResponse.error.message);
      return;
    }
    if (preferenceResponse.error) {
      setError(preferenceResponse.error.message);
      return;
    }

    setNotifications(notificationResponse.data ?? []);
    if (preferenceResponse.data) {
      setPreferences(preferenceResponse.data);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const savePreferences = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    const { error: upsertError } = await supabase.from("notification_preferences").upsert({
      user_id: profile.id,
      email_enabled: preferences.email_enabled,
      in_app_enabled: preferences.in_app_enabled,
      attendance_alerts: preferences.attendance_alerts,
      hr_alerts: preferences.hr_alerts,
    });
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setMessage("Notification preferences saved.");
  };

  const markRead = async (id) => {
    setReadingId(id);
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setReadingId("");
    if (updateError) {
      setError(updateError.message);
      return;
    }
    loadData();
  };

  return (
    <section className="grid-two responsive">
      <div className="panel">
        <div className="section-header">
          <h2>Notification Center</h2>
          <p>In-app alerts today, with email delivery architecture ready for backend sender integration.</p>
        </div>
        <div className="stack">
          {notifications.map((item) => (
            <article key={item.id} className={`message-card ${item.read_at ? "" : "unread-card"}`}>
              <div className="message-meta">
                <strong>{item.title}</strong>
                <span>{formatDateTime(item.created_at)}</span>
              </div>
              <p>{item.body}</p>
              <div className="row-end">
                <span className={`status-pill ${item.channel === "email" ? "under_review" : "verified"}`}>{item.channel}</span>
                {!item.read_at && (
                  <button type="button" className="ghost-button" onClick={() => markRead(item.id)} disabled={readingId === item.id}>
                    {readingId === item.id ? "Saving..." : "Mark Read"}
                  </button>
                )}
              </div>
            </article>
          ))}
          {!notifications.length && <div className="empty-state">No notifications yet for {company?.name ?? "your workspace"}.</div>}
        </div>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Preferences</h2>
          <p>Choose how WorkPulse should notify you. Email requires a secure backend sender to be configured later.</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        {!!message && <div className="alert success">{message}</div>}
        <form onSubmit={savePreferences} className="stack">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.in_app_enabled}
              onChange={(event) => setPreferences((current) => ({ ...current, in_app_enabled: event.target.checked }))}
            />
            Enable in-app notifications
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.email_enabled}
              onChange={(event) => setPreferences((current) => ({ ...current, email_enabled: event.target.checked }))}
            />
            Enable email notifications
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.attendance_alerts}
              onChange={(event) => setPreferences((current) => ({ ...current, attendance_alerts: event.target.checked }))}
            />
            Attendance and report alerts
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.hr_alerts}
              onChange={(event) => setPreferences((current) => ({ ...current, hr_alerts: event.target.checked }))}
            />
            HR and approval alerts
          </label>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </form>
      </div>
    </section>
  );
}
