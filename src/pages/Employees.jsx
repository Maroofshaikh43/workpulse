import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { createCsv, downloadTextFile, formatDate, getToday } from "../utils";

const defaultForm = {
  name: "",
  email: "",
  phone: "",
  department: "",
  password: "",
};

export default function Employees() {
  const { supabase, profile } = useOutletContext();
  const [employees, setEmployees] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [driveLinks, setDriveLinks] = useState({});
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadEmployees = async () => {
    const [employeeResponse, attendanceResponse] = await Promise.all([
      supabase.from("users").select("*").eq("company_id", profile.company_id).order("created_at", { ascending: false }),
      supabase.from("attendance").select("*").eq("company_id", profile.company_id).eq("date", getToday()),
    ]);
    if (employeeResponse.error) {
      setError(employeeResponse.error.message);
      return;
    }
    if (attendanceResponse.error) {
      setError(attendanceResponse.error.message);
      return;
    }
    const employeeData = employeeResponse.data ?? [];
    setEmployees(employeeData);
    setAttendanceRows(attendanceResponse.data ?? []);
    setDriveLinks(
      employeeData.reduce((accumulator, employee) => {
        accumulator[employee.id] = employee.daily_report_drive_url ?? "";
        return accumulator;
      }, {}),
    );
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleStatusToggle = async (employee) => {
    const { error: updateError } = await supabase
      .from("users")
      .update({ is_active: !employee.is_active })
      .eq("id", employee.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage(`${employee.name} has been ${employee.is_active ? "deactivated" : "reactivated"}.`);
    loadEmployees();
  };

  const handleCreateEmployee = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const currentSession = (await supabase.auth.getSession()).data.session;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Supabase did not return a user for employee creation.");

      const { error: insertError } = await supabase.from("users").insert({
        id: signUpData.user.id,
        company_id: profile.company_id,
        name: form.name,
        email: form.email,
        phone: form.phone,
        department: form.department,
        role: "employee",
        is_active: true,
      });
      if (insertError) throw insertError;

      if (currentSession) {
        await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
      }

      setMessage("Employee account created. They must verify their email before accessing the app.");
      setForm(defaultForm);
      loadEmployees();
    } catch (creationError) {
      setError(creationError.message);
    }
  };

  const saveDriveLink = async (employeeId) => {
    const { error: updateError } = await supabase
      .from("users")
      .update({ daily_report_drive_url: driveLinks[employeeId] || null })
      .eq("id", employeeId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Drive link updated.");
    loadEmployees();
  };

  const exportAttendanceCsv = () => {
    const employeeMap = employees.reduce((accumulator, item) => {
      accumulator[item.id] = item;
      return accumulator;
    }, {});
    const csv = createCsv(
      attendanceRows.map((item) => ({
        employee: employeeMap[item.user_id]?.name ?? item.user_id,
        department: employeeMap[item.user_id]?.department ?? "",
        date: item.date,
        check_in_time: item.check_in_time,
        check_out_time: item.check_out_time,
        status: item.status,
      })),
    );
    downloadTextFile(csv, `attendance-${getToday()}.csv`);
  };

  return (
    <section className="page-stack">
      {!!error && <div className="alert error">{error}</div>}
      {!!message && <div className="alert success">{message}</div>}

      <div className="panel">
        <div className="section-header">
          <h2>Employee Onboarding</h2>
          <p>Create accounts for new joiners and let Supabase send verification emails automatically.</p>
        </div>
        <form onSubmit={handleCreateEmployee} className="stack">
          <div className="grid-three">
            <label>
              Name
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                required
              />
            </label>
          </div>
          <div className="grid-two">
            <label>
              Department
              <input
                value={form.department}
                onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
                required
              />
            </label>
            <label>
              Temporary Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                required
              />
            </label>
          </div>
          <button className="primary-button" type="submit">
            Add Employee
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Staff Directory</h2>
          <p>Manage activation, export attendance, and assign each employee their dedicated Drive report link.</p>
        </div>
        <div className="row-end">
          <button type="button" className="ghost-button" onClick={exportAttendanceCsv}>
            Export Attendance CSV
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Drive Link</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.name}</td>
                  <td>{employee.department}</td>
                  <td>{employee.email}</td>
                  <td>{formatDate(employee.created_at)}</td>
                  <td>{employee.is_active ? "Active" : "Inactive"}</td>
                  <td>
                    <div className="table-input-group">
                      <input
                        type="url"
                        placeholder="https://drive.google.com/..."
                        value={driveLinks[employee.id] ?? ""}
                        onChange={(event) =>
                          setDriveLinks((current) => ({ ...current, [employee.id]: event.target.value }))
                        }
                      />
                      <button type="button" className="ghost-button" onClick={() => saveDriveLink(employee.id)}>
                        Save
                      </button>
                    </div>
                  </td>
                  <td>
                    <button type="button" className="link-button" onClick={() => handleStatusToggle(employee)}>
                      {employee.is_active ? "Remove" : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
              {!employees.length && (
                <tr>
                  <td colSpan="7" className="empty-cell">
                    No employees found.
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
