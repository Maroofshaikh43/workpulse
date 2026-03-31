import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDateTime } from "../utils";

const defaultForm = {
  asset_tag: "",
  name: "",
  category: "Laptop",
  serial_number: "",
  status: "available",
  assigned_to: "",
  notes: "",
};

export default function Assets() {
  const { supabase, profile } = useOutletContext();
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isManager = ["hr", "admin", "super_admin"].includes(profile.role);

  const loadData = async () => {
    const assetQuery =
      profile.role === "employee"
        ? supabase.from("assets").select("*").eq("assigned_to", profile.id).order("created_at", { ascending: false })
        : profile.role === "super_admin"
          ? supabase.from("assets").select("*").order("created_at", { ascending: false })
        : supabase.from("assets").select("*").eq("company_id", profile.company_id).order("created_at", { ascending: false });

    const userQuery =
      profile.role === "super_admin"
        ? Promise.resolve({ data: [] })
        : supabase.from("users").select("id,name,department").eq("company_id", profile.company_id).eq("is_active", true);

    const [assetResponse, userResponse] = await Promise.all([assetQuery, userQuery]);
    if (assetResponse.error) {
      setError(assetResponse.error.message);
      return;
    }
    if (userResponse.error) {
      setError(userResponse.error.message);
      return;
    }
    setAssets(assetResponse.data ?? []);
    setUsers(userResponse.data ?? []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const userMap = useMemo(
    () =>
      users.reduce((accumulator, user) => {
        accumulator[user.id] = user;
        return accumulator;
      }, {}),
    [users],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    const payload = {
      company_id: profile.company_id,
      asset_tag: form.asset_tag,
      name: form.name,
      category: form.category,
      serial_number: form.serial_number || null,
      status: form.status,
      assigned_to: form.assigned_to || null,
      assigned_at: form.assigned_to ? new Date().toISOString() : null,
      notes: form.notes || null,
    };
    const { error: insertError } = await supabase.from("assets").insert(payload);
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setMessage("Asset saved successfully.");
    setForm(defaultForm);
    loadData();
  };

  return (
    <section className="page-stack">
      {isManager && profile.role !== "super_admin" && (
        <div className="panel">
          <div className="section-header">
            <h2>Asset Management</h2>
            <p>Track laptops, IDs, and office devices assigned across the company.</p>
          </div>
          {!!error && <div className="alert error">{error}</div>}
          {!!message && <div className="alert success">{message}</div>}
          <form onSubmit={handleSubmit} className="stack">
            <div className="grid-three">
              <label>
                Asset Tag
                <input value={form.asset_tag} onChange={(event) => setForm((current) => ({ ...current, asset_tag: event.target.value }))} required />
              </label>
              <label>
                Asset Name
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                Category
                <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                  <option>Laptop</option>
                  <option>ID Card</option>
                  <option>Phone</option>
                  <option>Monitor</option>
                  <option>Accessory</option>
                </select>
              </label>
            </div>
            <div className="grid-three">
              <label>
                Serial Number
                <input value={form.serial_number} onChange={(event) => setForm((current) => ({ ...current, serial_number: event.target.value }))} />
              </label>
              <label>
                Status
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="available">available</option>
                  <option value="assigned">assigned</option>
                  <option value="repair">repair</option>
                  <option value="retired">retired</option>
                </select>
              </label>
              <label>
                Assigned To
                <select value={form.assigned_to} onChange={(event) => setForm((current) => ({ ...current, assigned_to: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} - {user.department}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Notes
              <textarea rows="4" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Asset"}
            </button>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="section-header">
          <h2>{profile.role === "employee" ? "My Assets" : "Asset Register"}</h2>
          <p>{profile.role === "employee" ? "View all hardware and credentials currently assigned to you." : "Current company asset inventory and assignment status."}</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Category</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>Assigned At</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <strong>{asset.name}</strong>
                    <div className="table-subtext">{asset.asset_tag}</div>
                  </td>
                  <td>{asset.category}</td>
                  <td>
                    <span className={`status-pill ${asset.status}`}>{asset.status}</span>
                  </td>
                  <td>{userMap[asset.assigned_to]?.name ?? (asset.assigned_to === profile.id ? profile.name : "Unassigned")}</td>
                  <td>{formatDateTime(asset.assigned_at)}</td>
                  <td>{asset.notes ?? "--"}</td>
                </tr>
              ))}
              {!assets.length && (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    No assets found.
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
