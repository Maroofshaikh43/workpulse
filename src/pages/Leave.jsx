import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { differenceInDays, formatDate } from "../utils";

const defaultForm = {
  type: "Casual",
  from_date: "",
  to_date: "",
  reason: "",
};

export default function Leave() {
  const { supabase, profile } = useOutletContext();
  const [leaves, setLeaves] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLeaves = async () => {
    const { data, error: leaveError } = await supabase
      .from("leaves")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });
    if (leaveError) {
      setError(leaveError.message);
      return;
    }
    setLeaves(data ?? []);
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  const balance = useMemo(() => {
    const totalAllocation = 24;
    const used = leaves.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.days, 0);
    const pending = leaves.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.days, 0);
    return {
      available: Math.max(0, totalAllocation - used),
      used,
      pending,
    };
  }, [leaves]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const days = differenceInDays(form.from_date, form.to_date);
    const { error: insertError } = await supabase.from("leaves").insert({
      ...form,
      days,
      user_id: profile.id,
      company_id: profile.company_id,
      status: "pending",
    });

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setMessage("Leave request submitted.");
    setForm(defaultForm);
    loadLeaves();
  };

  return (
    <section className="page-stack">
      <div className="grid-three">
        <div className="stat-card">
          <span>Available</span>
          <strong>{balance.available}</strong>
        </div>
        <div className="stat-card">
          <span>Used</span>
          <strong>{balance.used}</strong>
        </div>
        <div className="stat-card">
          <span>Pending</span>
          <strong>{balance.pending}</strong>
        </div>
      </div>

      <div className="grid-two responsive">
        <div className="panel">
          <div className="section-header">
            <h2>Apply Leave</h2>
            <p>Create a new leave request for review.</p>
          </div>
          {!!error && <div className="alert error">{error}</div>}
          {!!message && <div className="alert success">{message}</div>}
          <form onSubmit={handleSubmit} className="stack">
            <label>
              Leave Type
              <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>
                <option>Casual</option>
                <option>Sick</option>
                <option>Paid</option>
                <option>Emergency</option>
              </select>
            </label>
            <div className="grid-two">
              <label>
                From Date
                <input
                  type="date"
                  value={form.from_date}
                  onChange={(event) => setForm((current) => ({ ...current, from_date: event.target.value }))}
                  required
                />
              </label>
              <label>
                To Date
                <input
                  type="date"
                  value={form.to_date}
                  onChange={(event) => setForm((current) => ({ ...current, to_date: event.target.value }))}
                  required
                />
              </label>
            </div>
            <label>
              Reason
              <textarea
                rows="5"
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="section-header">
            <h2>Leave History</h2>
            <p>Track your submitted requests and decisions.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((item) => (
                  <tr key={item.id}>
                    <td>{item.type}</td>
                    <td>
                      {formatDate(item.from_date)} - {formatDate(item.to_date)}
                    </td>
                    <td>{item.days}</td>
                    <td>
                      <span className={`status-pill ${item.status}`}>{item.status}</span>
                    </td>
                  </tr>
                ))}
                {!leaves.length && (
                  <tr>
                    <td colSpan="4" className="empty-cell">
                      No leave requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
