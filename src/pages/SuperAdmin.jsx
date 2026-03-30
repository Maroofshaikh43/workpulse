import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDate } from "../utils";

export default function SuperAdmin() {
  const { supabase } = useOutletContext();
  const [companies, setCompanies] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [assets, setAssets] = useState([]);
  const [googleIntegrations, setGoogleIntegrations] = useState([]);
  const [notes, setNotes] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    const [companiesResponse, documentsResponse, usersResponse, notificationsResponse, assetsResponse, googleResponse] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
      supabase.from("company_verification_documents").select("*").order("created_at", { ascending: false }),
      supabase.from("users").select("id,company_id").order("created_at", { ascending: false }),
      supabase.from("notifications").select("*"),
      supabase.from("assets").select("*"),
      supabase.from("google_workspace_integrations").select("*"),
    ]);

    if (companiesResponse.error) {
      setError(companiesResponse.error.message);
      return;
    }
    if (documentsResponse.error) {
      setError(documentsResponse.error.message);
      return;
    }
    if (usersResponse.error) {
      setError(usersResponse.error.message);
      return;
    }
    if (notificationsResponse.error) {
      setError(notificationsResponse.error.message);
      return;
    }
    if (assetsResponse.error) {
      setError(assetsResponse.error.message);
      return;
    }
    if (googleResponse.error) {
      setError(googleResponse.error.message);
      return;
    }

    const counts = (usersResponse.data ?? []).reduce((accumulator, user) => {
      accumulator[user.company_id] = (accumulator[user.company_id] ?? 0) + 1;
      return accumulator;
    }, {});

    const companyRows = (companiesResponse.data ?? []).map((company) => ({
      ...company,
      employee_count: counts[company.id] ?? 0,
    }));

    setCompanies(companyRows);
    setDocuments(documentsResponse.data ?? []);
    setNotifications(notificationsResponse.data ?? []);
    setAssets(assetsResponse.data ?? []);
    setGoogleIntegrations(googleResponse.data ?? []);
    setNotes(
      companyRows.reduce((accumulator, company) => {
        accumulator[company.id] = company.verification_notes ?? "";
        return accumulator;
      }, {}),
    );
  };

  useEffect(() => {
    loadData();
  }, []);

  const docsByCompany = useMemo(
    () =>
      documents.reduce((accumulator, document) => {
        if (!accumulator[document.company_id]) accumulator[document.company_id] = [];
        accumulator[document.company_id].push(document);
        return accumulator;
      }, {}),
    [documents],
  );

  const updateStatus = async (companyId, verificationStatus) => {
    setError("");
    setMessage("");
    const updates = {
      verification_status: verificationStatus,
      verification_notes: notes[companyId] || null,
      verified_at: verificationStatus === "verified" ? new Date().toISOString() : null,
    };
    const { error: updateError } = await supabase.from("companies").update(updates).eq("id", companyId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage(`Company marked as ${verificationStatus}.`);
    loadData();
  };

  return (
    <section className="page-stack">
      {!!error && <div className="alert error">{error}</div>}
      {!!message && <div className="alert success">{message}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <span>Total Companies</span>
          <strong>{companies.length}</strong>
        </div>
        <div className="stat-card">
          <span>Active Users</span>
          <strong>{companies.reduce((sum, item) => sum + item.employee_count, 0)}</strong>
        </div>
        <div className="stat-card">
          <span>Pending Review</span>
          <strong>{companies.filter((item) => ["pending", "under_review"].includes(item.verification_status)).length}</strong>
        </div>
        <div className="stat-card">
          <span>Verified</span>
          <strong>{companies.filter((item) => item.verification_status === "verified").length}</strong>
        </div>
        <div className="stat-card">
          <span>Verification Backlog</span>
          <strong>{companies.filter((item) => item.verification_status !== "verified").length}</strong>
        </div>
        <div className="stat-card">
          <span>Churn Risk</span>
          <strong>{companies.filter((item) => item.employee_count < 3 && item.verification_status === "verified").length}</strong>
        </div>
        <div className="stat-card">
          <span>Total Assets</span>
          <strong>{assets.length}</strong>
        </div>
        <div className="stat-card">
          <span>Notifications</span>
          <strong>{notifications.length}</strong>
        </div>
        <div className="stat-card">
          <span>Drive Sync Ready</span>
          <strong>{googleIntegrations.filter((item) => item.sync_status === "connected").length}</strong>
        </div>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Platform Company Review</h2>
          <p>Review business documents, approve verified companies, and control which companies can onboard employees.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Employees</th>
                <th>Created</th>
                <th>Documents</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>
                    <strong>{company.name}</strong>
                    <div className="table-subtext">{company.company_code}</div>
                  </td>
                  <td>
                    <span className={`status-pill ${company.verification_status}`}>
                      {company.verification_status}
                    </span>
                  </td>
                  <td>{company.employee_count}</td>
                  <td>{formatDate(company.created_at)}</td>
                  <td>
                    <div className="docs-list">
                      {(docsByCompany[company.id] ?? []).map((doc) => (
                        <a key={doc.id} href={doc.file_url} target="_blank" rel="noreferrer" className="link-button">
                          {doc.document_type}
                        </a>
                      ))}
                      {!(docsByCompany[company.id] ?? []).length && <span className="table-subtext">No documents</span>}
                    </div>
                  </td>
                  <td>
                    <textarea
                      rows="3"
                      value={notes[company.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [company.id]: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <div className="action-column">
                      <button type="button" className="ghost-button" onClick={() => updateStatus(company.id, "under_review")}>
                        Review
                      </button>
                      <button type="button" className="primary-button" onClick={() => updateStatus(company.id, "verified")}>
                        Verify
                      </button>
                      <button type="button" className="link-button danger" onClick={() => updateStatus(company.id, "rejected")}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!companies.length && (
                <tr>
                  <td colSpan="7" className="empty-cell">
                    No companies found.
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
