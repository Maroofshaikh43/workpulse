import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { countWorkingDaysBetween, formatDate, getFirstDayOfCurrentMonth, getToday, hoursBetween } from "../utils";

export default function Profile() {
  const { supabase, profile } = useOutletContext();
  const [attendance, setAttendance] = useState([]);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const start = getFirstDayOfCurrentMonth();
    const today = getToday();

    const loadAttendance = async () => {
      const [attendanceResponse, assetResponse] = await Promise.all([
        supabase
          .from("attendance")
          .select("*")
          .eq("user_id", profile.id)
          .gte("date", start)
          .lte("date", today)
          .order("date", { ascending: false }),
        supabase.from("assets").select("*").eq("assigned_to", profile.id).order("created_at", { ascending: false }),
      ]);
      if (attendanceResponse.error) {
        setError(attendanceResponse.error.message);
        return;
      }
      if (assetResponse.error) {
        setError(assetResponse.error.message);
        return;
      }
      setAttendance(attendanceResponse.data ?? []);
      setAssets(assetResponse.data ?? []);
    };

    loadAttendance();
  }, [profile.id, supabase]);

  const summary = useMemo(() => {
    const present = attendance.filter((item) => item.status === "present").length;
    const late = attendance.filter((item) => item.status === "late").length;
    const workingDays = countWorkingDaysBetween(getFirstDayOfCurrentMonth(), getToday());
    const absent = Math.max(0, workingDays - present - late);
    const completedDays = attendance.filter((item) => item.check_in_time && item.check_out_time);
    const avgHours =
      completedDays.length === 0
        ? 0
        : completedDays.reduce((sum, item) => sum + hoursBetween(item.check_in_time, item.check_out_time), 0) /
          completedDays.length;
    return { present, late, absent, avgHours };
  }, [attendance]);

  return (
    <section className="page-stack">
      {!!error && <div className="alert error">{error}</div>}
      <div className="grid-two responsive">
        <div className="panel">
          <div className="section-header">
            <h2>Profile</h2>
            <p>Your basic company and department information.</p>
          </div>
          <div className="profile-card">
            <img src={profile.profile_photo_url} alt={profile.name} className="avatar-large" />
            <div>
              <h3>{profile.name}</h3>
              <p>{profile.email}</p>
              <p>{profile.phone}</p>
              <p>Department: {profile.department}</p>
              <p>Role: {profile.role}</p>
              <p>Joined: {formatDate(profile.created_at)}</p>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h2>Monthly Attendance Summary</h2>
            <p>Quick view of attendance performance for the current month.</p>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <span>Present</span>
              <strong>{summary.present}</strong>
            </div>
            <div className="stat-card">
              <span>Late</span>
              <strong>{summary.late}</strong>
            </div>
            <div className="stat-card">
              <span>Absent</span>
              <strong>{summary.absent}</strong>
            </div>
            <div className="stat-card">
              <span>Avg Hours</span>
              <strong>{summary.avgHours.toFixed(1)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Assigned Assets</h2>
          <p>Quick view of devices and credentials currently assigned to your account.</p>
        </div>
        <div className="message-list">
          {assets.map((asset) => (
            <article key={asset.id} className="message-card">
              <div className="message-meta">
                <strong>{asset.name}</strong>
                <span>{asset.category}</span>
              </div>
              <p>Asset Tag: {asset.asset_tag}</p>
              <small>Status: {asset.status}</small>
            </article>
          ))}
          {!assets.length && <div className="empty-state">No company assets are assigned to you right now.</div>}
        </div>
      </div>
    </section>
  );
}
