import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDate } from "../utils";

export default function LeaveApprovals() {
  const { supabase, profile, setPendingLeaves } = useOutletContext();
  const [requests, setRequests] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState("");

  const loadRequests = async () => {
    const [leaveResponse, userResponse] = await Promise.all([
      supabase.from("leaves").select("*").eq("company_id", profile.company_id).order("created_at", { ascending: false }),
      supabase.from("users").select("id,name,department").eq("company_id", profile.company_id),
    ]);

    if (leaveResponse.error) {
      setError(leaveResponse.error.message);
      return;
    }
    if (userResponse.error) {
      setError(userResponse.error.message);
      return;
    }

    const leaveData = leaveResponse.data ?? [];
    setRequests(leaveData);
    setUsersMap(
      (userResponse.data ?? []).reduce((accumulator, user) => {
        accumulator[user.id] = user;
        return accumulator;
      }, {}),
    );
    setPendingLeaves(leaveData.filter((item) => item.status === "pending").length);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const updateStatus = async (requestId, status) => {
    setActionId(`${requestId}-${status}`);
    const { error: updateError } = await supabase
      .from("leaves")
      .update({ status, reviewed_by: profile.id })
      .eq("id", requestId);
    setActionId("");
    if (updateError) {
      setError(updateError.message);
      return;
    }
    loadRequests();
  };

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Leave Approvals</h2>
        <p>Review and action pending leave requests from employees.</p>
      </div>
      {!!error && <div className="alert error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((item) => (
              <tr key={item.id}>
                <td>{usersMap[item.user_id]?.name ?? item.user_id}</td>
                <td>{usersMap[item.user_id]?.department ?? "--"}</td>
                <td>
                  {formatDate(item.from_date)} - {formatDate(item.to_date)}
                </td>
                <td>{item.days}</td>
                <td>
                  <span className={`status-pill ${item.status}`}>{item.status}</span>
                </td>
                <td>
                  {item.status === "pending" ? (
                    <div className="action-row">
                      <button type="button" className="link-button" onClick={() => updateStatus(item.id, "approved")} disabled={actionId === `${item.id}-approved`}>
                        {actionId === `${item.id}-approved` ? "Approving..." : "Approve"}
                      </button>
                      <button type="button" className="link-button danger" onClick={() => updateStatus(item.id, "rejected")} disabled={actionId === `${item.id}-rejected`}>
                        {actionId === `${item.id}-rejected` ? "Rejecting..." : "Reject"}
                      </button>
                    </div>
                  ) : (
                    "--"
                  )}
                </td>
              </tr>
            ))}
            {!requests.length && (
              <tr>
                <td colSpan="6" className="empty-cell">
                  No leave requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
