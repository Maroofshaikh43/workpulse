import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDate } from "../utils";

const defaultForm = {
  to_group: "all",
  subject: "",
  body: "",
};

export default function Broadcast() {
  const { supabase, profile } = useOutletContext();
  const [messages, setMessages] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadMessages = async () => {
    const [broadcastResponse, usersResponse] = await Promise.all([
      supabase.from("broadcasts").select("*").eq("company_id", profile.company_id).order("created_at", { ascending: false }),
      supabase.from("users").select("department").eq("company_id", profile.company_id),
    ]);

    if (broadcastResponse.error) {
      setError(broadcastResponse.error.message);
      return;
    }
    if (usersResponse.error) {
      setError(usersResponse.error.message);
      return;
    }

    setMessages(broadcastResponse.data ?? []);
    setDepartments([...new Set((usersResponse.data ?? []).map((user) => user.department).filter(Boolean))]);
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const { error: insertError } = await supabase.from("broadcasts").insert({
      sender_id: profile.id,
      company_id: profile.company_id,
      to_group: form.to_group,
      subject: form.subject,
      body: form.body,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setMessage("Broadcast sent successfully.");
    setForm(defaultForm);
    loadMessages();
  };

  return (
    <section className="grid-two responsive">
      <div className="panel">
        <div className="section-header">
          <h2>Send Broadcast</h2>
          <p>Reach everyone, a department, or a management role from one screen.</p>
        </div>
        {!!message && <div className="alert success">{message}</div>}
        {!!error && <div className="alert error">{error}</div>}
        <form onSubmit={handleSubmit} className="stack">
          <label>
            Audience
            <select value={form.to_group} onChange={(event) => setForm((current) => ({ ...current, to_group: event.target.value }))}>
              <option value="all">All Employees</option>
              <option value="employee">Employees</option>
              <option value="hr">HR</option>
              <option value="admin">Admin</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  Department: {department}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} required />
          </label>
          <label>
            Message
            <textarea
              rows="6"
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              required
            />
          </label>
          <button className="primary-button" type="submit">
            Send Broadcast
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Sent Broadcasts</h2>
          <p>Recent communications across the company.</p>
        </div>
        <div className="message-list">
          {messages.map((item) => (
            <article className="message-card" key={item.id}>
              <div className="message-meta">
                <strong>{item.subject}</strong>
                <span>{formatDate(item.created_at)}</span>
              </div>
              <p>{item.body}</p>
              <small>Audience: {item.to_group}</small>
            </article>
          ))}
          {!messages.length && <div className="empty-state">No broadcasts sent yet.</div>}
        </div>
      </div>
    </section>
  );
}
