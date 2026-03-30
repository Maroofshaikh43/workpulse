import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDate } from "../utils";

const defaultCompose = {
  to_group: "hr",
  subject: "",
  body: "",
};

export default function Mail() {
  const { supabase, profile } = useOutletContext();
  const [messages, setMessages] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [compose, setCompose] = useState(defaultCompose);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadInbox = async () => {
    const [broadcastResponse, usersResponse] = await Promise.all([
      supabase
        .from("broadcasts")
        .select("*")
        .eq("company_id", profile.company_id)
        .in("to_group", ["all", profile.department, profile.role])
        .order("created_at", { ascending: false }),
      supabase.from("users").select("id,name,role").eq("company_id", profile.company_id),
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
    setUsersMap(
      (usersResponse.data ?? []).reduce((accumulator, item) => {
        accumulator[item.id] = item;
        return accumulator;
      }, {}),
    );
  };

  useEffect(() => {
    loadInbox();
  }, []);

  const sendMessage = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const { error: insertError } = await supabase.from("broadcasts").insert({
      sender_id: profile.id,
      company_id: profile.company_id,
      to_group: compose.to_group,
      subject: compose.subject,
      body: compose.body,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCompose(defaultCompose);
    setMessage("Message sent successfully.");
  };

  return (
    <section className="grid-two responsive">
      <div className="panel">
        <div className="section-header">
          <h2>Inbox</h2>
          <p>Messages sent by Admin or HR to your role, department, or everyone.</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        <div className="message-list">
          {messages.map((item) => (
            <article className="message-card" key={item.id}>
              <div className="message-meta">
                <strong>{item.subject}</strong>
                <span>{formatDate(item.created_at)}</span>
              </div>
              <p>{item.body}</p>
              <small>
                From {usersMap[item.sender_id]?.name ?? "Unknown"} to {item.to_group}
              </small>
            </article>
          ))}
          {!messages.length && <div className="empty-state">No messages in your inbox yet.</div>}
        </div>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Compose Mail</h2>
          <p>Employees can message Admin or HR directly.</p>
        </div>
        {!!message && <div className="alert success">{message}</div>}
        <form onSubmit={sendMessage} className="stack">
          <label>
            Send To
            <select
              value={compose.to_group}
              onChange={(event) => setCompose((current) => ({ ...current, to_group: event.target.value }))}
            >
              <option value="hr">HR</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Subject
            <input
              value={compose.subject}
              onChange={(event) => setCompose((current) => ({ ...current, subject: event.target.value }))}
              required
            />
          </label>
          <label>
            Message
            <textarea
              rows="6"
              value={compose.body}
              onChange={(event) => setCompose((current) => ({ ...current, body: event.target.value }))}
              required
            />
          </label>
          <button className="primary-button" type="submit">
            Send Mail
          </button>
        </form>
      </div>
    </section>
  );
}
