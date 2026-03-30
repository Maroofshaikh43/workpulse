import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { average, getWeekdayBuckets, hoursBetween } from "../utils";

const chartColors = ["#6366f1", "#8b5cf6", "#22c55e", "#f97316", "#38bdf8", "#f59e0b"];

export default function Analytics() {
  const { supabase, profile } = useOutletContext();
  const [attendance, setAttendance] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const firstDate = getWeekdayBuckets()[0].key;

    const loadData = async () => {
      const [attendanceResponse, usersResponse] = await Promise.all([
        supabase.from("attendance").select("*").eq("company_id", profile.company_id).gte("date", firstDate),
        supabase.from("users").select("id,department").eq("company_id", profile.company_id).eq("is_active", true),
      ]);

      if (attendanceResponse.error) {
        setError(attendanceResponse.error.message);
        return;
      }
      if (usersResponse.error) {
        setError(usersResponse.error.message);
        return;
      }
      setAttendance(attendanceResponse.data ?? []);
      setUsers(usersResponse.data ?? []);
    };

    loadData();
  }, []);

  const weeklyAttendanceData = useMemo(
    () =>
      getWeekdayBuckets().map((bucket) => ({
        name: bucket.label,
        present: attendance.filter((item) => item.date === bucket.key && item.status === "present").length,
        absent: Math.max(
          0,
          users.length - attendance.filter((item) => item.date === bucket.key && ["present", "late"].includes(item.status)).length,
        ),
        late: attendance.filter((item) => item.date === bucket.key && item.status === "late").length,
      })),
    [attendance, users],
  );

  const departmentDistribution = useMemo(() => {
    const map = users.reduce((accumulator, user) => {
      accumulator[user.department] = (accumulator[user.department] ?? 0) + 1;
      return accumulator;
    }, {});
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [users]);

  const averageHoursData = useMemo(
    () =>
      getWeekdayBuckets().map((bucket) => {
        const dayAttendance = attendance.filter((item) => item.date === bucket.key);
        return {
          name: bucket.label,
          hours: Number(
            average(dayAttendance.map((item) => hoursBetween(item.check_in_time, item.check_out_time))).toFixed(1),
          ),
        };
      }),
    [attendance],
  );

  const stats = useMemo(() => {
    const checkIns = attendance.filter((item) => item.check_in_time).map((item) => item.check_in_time);
    const checkOuts = attendance.filter((item) => item.check_out_time).map((item) => item.check_out_time);
    const punctual = attendance.filter((item) => item.status === "present").length;
    const attended = attendance.filter((item) => ["present", "late"].includes(item.status)).length;

    const averageTime = (times) => {
      if (!times.length) return "--";
      const averageMinutes = Math.round(
        average(
          times.map((value) => {
            const [hours, minutes] = value.split(":").map(Number);
            return hours * 60 + minutes;
          }),
        ),
      );
      const hours = String(Math.floor(averageMinutes / 60)).padStart(2, "0");
      const minutes = String(averageMinutes % 60).padStart(2, "0");
      return `${hours}:${minutes}`;
    };

    return {
      avgCheckIn: averageTime(checkIns),
      avgCheckOut: averageTime(checkOuts),
      punctualityRate: attended ? `${Math.round((punctual / attended) * 100)}%` : "0%",
      avgHours:
        attendance.length === 0
          ? "0.0"
          : average(attendance.map((item) => hoursBetween(item.check_in_time, item.check_out_time))).toFixed(1),
    };
  }, [attendance]);

  return (
    <section className="page-stack">
      {!!error && <div className="alert error">{error}</div>}
      <div className="stat-grid">
        <div className="stat-card">
          <span>Avg Check-In</span>
          <strong>{stats.avgCheckIn}</strong>
        </div>
        <div className="stat-card">
          <span>Avg Check-Out</span>
          <strong>{stats.avgCheckOut}</strong>
        </div>
        <div className="stat-card">
          <span>Punctuality Rate</span>
          <strong>{stats.punctualityRate}</strong>
        </div>
        <div className="stat-card">
          <span>Avg Hours</span>
          <strong>{stats.avgHours}</strong>
        </div>
      </div>

      <div className="grid-two responsive">
        <div className="panel chart-panel">
          <div className="section-header">
            <h2>Weekly Attendance</h2>
            <p>Present, absent, and late counts for the last seven days.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={weeklyAttendanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Legend />
              <Bar dataKey="present" fill="#22c55e" radius={[6, 6, 0, 0]} />
              <Bar dataKey="absent" fill="#ef4444" radius={[6, 6, 0, 0]} />
              <Bar dataKey="late" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel chart-panel">
          <div className="section-header">
            <h2>Department Distribution</h2>
            <p>Current active headcount split by department.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={departmentDistribution} dataKey="value" nameKey="name" outerRadius={110} label>
                {departmentDistribution.map((entry, index) => (
                  <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel chart-panel">
          <div className="section-header">
            <h2>Average Hours This Week</h2>
            <p>Average hours inferred from attendance check-in and check-out times.</p>
          </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={averageHoursData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip />
            <Line type="monotone" dataKey="hours" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
