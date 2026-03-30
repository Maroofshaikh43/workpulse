import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { createCsv, downloadTextFile, formatDate } from "../utils";

const defaultForm = {
  user_id: "",
  month: "",
  year: new Date().getFullYear(),
  basic: "",
  hra: "",
  bonus: "",
  tds: "",
  net: "",
  slipFile: null,
};

export default function SalarySlips() {
  const { supabase, profile } = useOutletContext();
  const [slips, setSlips] = useState([]);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isManager = ["hr", "admin"].includes(profile.role);

  const loadData = async () => {
    const slipQuery = supabase
      .from("salary_slips")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    const employeeQuery = isManager
      ? supabase.from("users").select("id,name,department").eq("company_id", profile.company_id).eq("is_active", true)
      : Promise.resolve({ data: [] });

    const [slipResponse, employeeResponse] = await Promise.all([slipQuery, employeeQuery]);

    if (slipResponse.error) {
      setError(slipResponse.error.message);
      return;
    }

    const filteredSlips = isManager
      ? slipResponse.data ?? []
      : (slipResponse.data ?? []).filter((item) => item.user_id === profile.id);

    setSlips(filteredSlips);
    setEmployees(employeeResponse.data ?? []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const uploadFile = async (file, path) => {
    const { error: uploadError } = await supabase.storage.from("salary-slips").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("salary-slips").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleManagerSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      let slipFileUrl = null;
      if (form.slipFile) {
        const extension = form.slipFile.name.split(".").pop();
        slipFileUrl = await uploadFile(
          form.slipFile,
          `${profile.company_id}/${form.user_id}/${form.year}-${form.month}.${extension}`,
        );
      }

      const { error: insertError } = await supabase.from("salary_slips").insert({
        user_id: form.user_id,
        company_id: profile.company_id,
        month: Number(form.month),
        year: Number(form.year),
        basic: Number(form.basic),
        hra: Number(form.hra),
        bonus: Number(form.bonus),
        tds: Number(form.tds),
        net: Number(form.net),
        slip_file_url: slipFileUrl,
        uploaded_by: profile.id,
      });
      if (insertError) throw insertError;

      setMessage("Salary slip uploaded.");
      setForm(defaultForm);
      loadData();
    } catch (uploadError) {
      setError(uploadError.message);
    }
  };

  const downloadSlipCsv = (slip) => {
    const csv = createCsv([
      {
        month: slip.month,
        year: slip.year,
        basic: slip.basic,
        hra: slip.hra,
        bonus: slip.bonus,
        tds: slip.tds,
        net: slip.net,
        generated_at: formatDate(new Date().toISOString()),
      },
    ]);
    downloadTextFile(csv, `salary-slip-${slip.month}-${slip.year}.csv`);
  };

  return (
    <section className="page-stack">
      {isManager && (
        <div className="panel">
          <div className="section-header">
            <h2>Upload Salary Slip</h2>
            <p>HR and Admin users can upload monthly payroll records.</p>
          </div>
          {!!error && <div className="alert error">{error}</div>}
          {!!message && <div className="alert success">{message}</div>}
          <form onSubmit={handleManagerSubmit} className="stack">
            <div className="grid-three">
              <label>
                Employee
                <select
                  value={form.user_id}
                  onChange={(event) => setForm((current) => ({ ...current, user_id: event.target.value }))}
                  required
                >
                  <option value="">Select employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} - {employee.department}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Month
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={form.month}
                  onChange={(event) => setForm((current) => ({ ...current, month: event.target.value }))}
                  required
                />
              </label>
              <label>
                Year
                <input
                  type="number"
                  value={form.year}
                  onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))}
                  required
                />
              </label>
            </div>
            <div className="grid-three">
              <label>
                Basic
                <input
                  type="number"
                  value={form.basic}
                  onChange={(event) => setForm((current) => ({ ...current, basic: event.target.value }))}
                  required
                />
              </label>
              <label>
                HRA
                <input
                  type="number"
                  value={form.hra}
                  onChange={(event) => setForm((current) => ({ ...current, hra: event.target.value }))}
                  required
                />
              </label>
              <label>
                Bonus
                <input
                  type="number"
                  value={form.bonus}
                  onChange={(event) => setForm((current) => ({ ...current, bonus: event.target.value }))}
                  required
                />
              </label>
            </div>
            <div className="grid-three">
              <label>
                TDS
                <input
                  type="number"
                  value={form.tds}
                  onChange={(event) => setForm((current) => ({ ...current, tds: event.target.value }))}
                  required
                />
              </label>
              <label>
                Net Pay
                <input
                  type="number"
                  value={form.net}
                  onChange={(event) => setForm((current) => ({ ...current, net: event.target.value }))}
                  required
                />
              </label>
              <label>
                Slip File
                <input
                  type="file"
                  accept=".pdf,.csv,image/*"
                  onChange={(event) => setForm((current) => ({ ...current, slipFile: event.target.files?.[0] ?? null }))}
                />
              </label>
            </div>
            <button className="primary-button" type="submit">
              Save Salary Slip
            </button>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="section-header">
          <h2>{isManager ? "All Salary Slips" : "My Salary Slips"}</h2>
          <p>Open a slip to view the payroll breakdown and download a CSV copy.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Year</th>
                <th>Net</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((item) => (
                <tr key={item.id}>
                  <td>{item.month}</td>
                  <td>{item.year}</td>
                  <td>{item.net}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => setSelectedSlip(item)}>
                      View Breakdown
                    </button>
                  </td>
                </tr>
              ))}
              {!slips.length && (
                <tr>
                  <td colSpan="4" className="empty-cell">
                    No salary slips available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSlip && (
        <div className="panel">
          <div className="section-header">
            <h2>
              Salary Breakdown {selectedSlip.month}/{selectedSlip.year}
            </h2>
            <p>Detailed payroll values for the selected month.</p>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <span>Basic</span>
              <strong>{selectedSlip.basic}</strong>
            </div>
            <div className="stat-card">
              <span>HRA</span>
              <strong>{selectedSlip.hra}</strong>
            </div>
            <div className="stat-card">
              <span>Bonus</span>
              <strong>{selectedSlip.bonus}</strong>
            </div>
            <div className="stat-card">
              <span>TDS</span>
              <strong>{selectedSlip.tds}</strong>
            </div>
            <div className="stat-card">
              <span>Net</span>
              <strong>{selectedSlip.net}</strong>
            </div>
          </div>
          <div className="row-end">
            {selectedSlip.slip_file_url && (
              <a className="ghost-button" href={selectedSlip.slip_file_url} target="_blank" rel="noreferrer">
                Open Uploaded File
              </a>
            )}
            <button type="button" className="primary-button" onClick={() => downloadSlipCsv(selectedSlip)}>
              Download CSV
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
