import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { average, formatLongDate, getDateOffset, getDatesBetween, getToday, hoursBetween, formatTime } from "../utils";

export default function Overview() {
  const { supabase, profile } = useOutletContext();
  const [attendanceList, setAttendanceList] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [historyAttendance, setHistoryAttendance] = useState([]);
  const [reportSubmissions, setReportSubmissions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadOverview = async () => {
    setLoading(true);
    const twoWeeksAgo = getDateOffset(-13);
    const today = getToday();
    const [employeesResponse, todayAttendanceResponse, historyAttendanceResponse, reportResponse] = await Promise.all([
      supabase
        .from("users")
        .select("id,name,department,role,is_active")
        .eq("company_id", profile.company_id)
        .eq("is_active", true)
        .in("role", ["employee", "hr", "admin"]),
      supabase.from("attendance").select("*").eq("company_id", profile.company_id).eq("date", getToday()),
      supabase.from("attendance").select("*").eq("company_id", profile.company_id).gte("date", twoWeeksAgo),
      supabase.from("daily_report_submissions").select("*").eq("company_id", profile.company_id).gte("date", twoWeeksAgo),
    ]);

    if (employeesResponse.error) {
      setError(employeesResponse.error.message);
      setLoading(false);
      return;
    }
    if (todayAttendanceResponse.error) {
      setError(todayAttendanceResponse.error.message);
      setLoading(false);
      return;
    }
    if (historyAttendanceResponse.error) {
      setError(historyAttendanceResponse.error.message);
      setLoading(false);
      return;
    }
    if (reportResponse.error) {
      setError(reportResponse.error.message);
      setLoading(false);
      return;
    }

    const employees = employeesResponse.data ?? [];
    const todayAttendance = todayAttendanceResponse.data ?? [];
    const combined = employees.map((employee) => {
      const record = todayAttendance.find((attendance) => attendance.user_id === employee.id);
      return {
        ...employee,
        status: record ? record.status : "absent",
        check_in: record?.check_in_time || "--",
        check_out: record?.check_out_time || "--",
      };
    });

    setAttendanceList(combined);
    setTodayAttendance(todayAttendanceResponse.data ?? []);
    setHistoryAttendance(historyAttendanceResponse.data ?? []);
    setReportSubmissions(reportResponse.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const smartAlerts = useMemo(() => {
    const alerts = [];
    const priorTwoDays = getDatesBetween(-2, -1);
    const currentWeek = getDatesBetween(-6, 0);
    const previousWeek = getDatesBetween(-13, -7);
    const users = attendanceList;

    const attendanceByUser = historyAttendance.reduce((accumulator, item) => {
      if (!accumulator[item.user_id]) accumulator[item.user_id] = [];
      accumulator[item.user_id].push(item);
      return accumulator;
    }, {});

    const submissionsByUser = reportSubmissions.reduce((accumulator, item) => {
      if (!accumulator[item.user_id]) accumulator[item.user_id] = [];
      accumulator[item.user_id].push(item);
      return accumulator;
    }, {});

    users.forEach((user) => {
      const userAttendance = attendanceByUser[user.id] ?? [];
      const userSubmissions = submissionsByUser[user.id] ?? [];
      const inactiveDays = priorTwoDays.filter(
        (date) => !userAttendance.some((item) => item.date === date && ["present", "late"].includes(item.status)),
      );

      if (inactiveDays.length === 2) {
        alerts.push({
          type: "critical",
          title: "Employee inactive for 2 days",
          body: `${user.name} has not marked attendance in the last 2 days.`,
        });
      }

      const currentWeekHours = average(
        userAttendance
          .filter((item) => currentWeek.includes(item.date))
          .map((item) => hoursBetween(item.check_in_time, item.check_out_time)),
      );
      const previousWeekHours = average(
        userAttendance
          .filter((item) => previousWeek.includes(item.date))
          .map((item) => hoursBetween(item.check_in_time, item.check_out_time)),
      );

      if (previousWeekHours > 0 && currentWeekHours < previousWeekHours * 0.75) {
        const drop = Math.round(((previousWeekHours - currentWeekHours) / previousWeekHours) * 100);
        alerts.push({
          type: "warning",
          title: "Performance dropped this week",
          body: `${user.name}'s average hours dropped ${drop}% compared with last week.`,
        });
      }

      const todayCheckIn = todayAttendance.find((item) => item.user_id === user.id)?.check_in_time;
      const todaySubmission = userSubmissions.find((item) => item.date === getToday());
      if (todayCheckIn && !todaySubmission) {
        alerts.push({
          type: "warning",
          title: "Report still pending today",
          body: `${user.name} checked in today but has not marked the daily report complete yet.`,
        });
      }
    });

    const topPerformer = users
      .map((user) => {
        const userAttendance = attendanceByUser[user.id] ?? [];
        const userSubmissions = submissionsByUser[user.id] ?? [];
        const presentCount = userAttendance.filter((item) => currentWeek.includes(item.date) && item.status === "present").length;
        const lateCount = userAttendance.filter((item) => currentWeek.includes(item.date) && item.status === "late").length;
        const reportCount = userSubmissions.filter((item) => currentWeek.includes(item.date)).length;
        const avgHours = average(
          userAttendance
            .filter((item) => currentWeek.includes(item.date))
            .map((item) => hoursBetween(item.check_in_time, item.check_out_time)),
        );
        const score = presentCount * 3 + reportCount * 2 + avgHours - lateCount;
        return { ...user, score };
      })
      .sort((a, b) => b.score - a.score)[0];

    if (topPerformer && Number.isFinite(topPerformer.score) && topPerformer.score > 0) {
      alerts.unshift({
        type: "success",
        title: "Top performer detected",
        body: `${topPerformer.name} is leading this week based on attendance consistency and report completion.`,
      });
    }

    return alerts.slice(0, 6);
  }, [attendanceList, historyAttendance, reportSubmissions, todayAttendance]);

  if (loading) {
    return <section className="panel empty-state">Loading overview...</section>;
  }

  return (
    <section className="page-stack">
      {!!error && <div className="alert error">{error}</div>}
      <div className="panel">
        <div className="section-header">
          <h2>Smart Alerts</h2>
          <p>{formatLongDate()}.</p>
        </div>
        <div className="smart-alert-grid">
          {smartAlerts.map((alert, index) => (
            <article key={`${alert.title}-${index}`} className={`smart-alert ${alert.type}`}>
              <strong>{alert.title}</strong>
              <p>{alert.body}</p>
            </article>
          ))}
          {!smartAlerts.length && <div className="empty-state">No smart alerts right now. Team activity looks healthy.</div>}
        </div>
      </div>
      <div className="panel">
        <div className="section-header">
          <h2>Today's Live Attendance</h2>
          <p>{formatLongDate()}.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Status</th>
                <th>Check In</th>
                <th>Check Out</th>
              </tr>
            </thead>
            <tbody>
              {attendanceList.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.department}</td>
                  <td>
                    <span className={`status-pill ${item.status}`}>{item.status}</span>
                  </td>
                  <td>{formatTime(item.check_in)}</td>
                  <td>{formatTime(item.check_out)}</td>
                </tr>
              ))}
              {!attendanceList.length && (
                <tr>
                  <td colSpan="5" className="empty-cell">
                    No employee records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
