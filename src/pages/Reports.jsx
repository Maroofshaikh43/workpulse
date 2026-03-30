import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { createCsv, downloadTextFile, formatDate } from "../utils";

export default function Reports() {
  const { supabase, profile, company } = useOutletContext();
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState("");

  const loadEmployees = async () => {
    const { data, error: employeeError } = await supabase
      .from("users")
      .select("id,name,email,department,created_at,daily_report_drive_url")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false });

    if (employeeError) {
      setError(employeeError.message);
      return;
    }

    setEmployees(data ?? []);
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const exportCsv = () => {
    const csv = createCsv(
      employees.map((item) => ({
        employee: item.name,
        email: item.email,
        department: item.department,
        joined: formatDate(item.created_at),
        drive_link: item.daily_report_drive_url ?? "",
      })),
    );
    downloadTextFile(csv, "employee-drive-links.csv");
  };

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Reporting Access</h2>
        <p>Manage visibility into each employee's Google Drive report link and export the rollout list.</p>
      </div>
      {!!error && <div className="alert error">{error}</div>}
      <div className="mini-card report-banner">
        <strong>Company Drive Folder</strong>
        <span>{company?.google_drive_folder_url ?? "Not configured yet."}</span>
      </div>
      <div className="row-end">
        <button type="button" className="ghost-button" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Email</th>
              <th>Joined</th>
              <th>Drive Link</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.department}</td>
                <td>{item.email}</td>
                <td>{formatDate(item.created_at)}</td>
                <td>{item.daily_report_drive_url ? "Assigned" : "Missing"}</td>
              </tr>
            ))}
            {!employees.length && (
              <tr>
                <td colSpan="5" className="empty-cell">
                  No employee records available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
