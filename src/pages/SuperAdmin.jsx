import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatDate, getFirstDayOfCurrentMonth, getToday, hoursBetween } from "../utils";

function isPreviewableImage(url = "") {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(url);
}

function normalizeCompanyStatus(status, verificationStatus) {
  if (status) return status;
  if (verificationStatus === "verified") return "approved";
  if (verificationStatus === "rejected") return "rejected";
  return "pending";
}

function DetailModal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function SuperAdmin() {
  const { supabase, profile } = useOutletContext();
  const [companies, setCompanies] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [notes, setNotes] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState("");
  const [documentsCompanyId, setDocumentsCompanyId] = useState("");
  const [detailCompanyId, setDetailCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [supportingDataLoading, setSupportingDataLoading] = useState(true);

  const buildCompanyRows = (rawCompanies, allUsers = users) => {
    const employeeCounts = allUsers.reduce((accumulator, user) => {
      accumulator[user.company_id] = (accumulator[user.company_id] ?? 0) + 1;
      return accumulator;
    }, {});

    const ownerMap = allUsers.reduce((accumulator, user) => {
      if (user.role === "admin" && !accumulator[user.company_id]) accumulator[user.company_id] = user;
      return accumulator;
    }, {});

    return (rawCompanies ?? []).map((company) => ({
      ...company,
      status: normalizeCompanyStatus(company.status, company.verification_status),
      employee_count: employeeCounts[company.id] ?? 0,
      owner: ownerMap[company.id] ?? allUsers.find((user) => user.company_id === company.id) ?? null,
    }));
  };

  const loadCompanies = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("companies")
      .select("*");

    console.log("Companies loaded:", data);

    if (data) {
      const nextCompanies = buildCompanyRows(data, users);
      setCompanies(nextCompanies);
      setNotes(
        nextCompanies.reduce((accumulator, company) => {
          accumulator[company.id] = company.verification_notes ?? "";
          return accumulator;
        }, {}),
      );
    }

    if (fetchError) {
      console.error("Load error:", fetchError);
      setError(fetchError.message);
    }

    setLoading(false);
  };

  const fetchSupportingData = async () => {
    setSupportingDataLoading(true);
    const monthStart = getFirstDayOfCurrentMonth();
    const today = getToday();
    const [documentsResponse, usersResponse, attendanceResponse] = await Promise.all([
      supabase.from("company_verification_documents").select("*").order("created_at", { ascending: false }),
      supabase
        .from("users")
        .select("id,company_id,name,email,phone,role,created_at,profile_photo_url,id_proof_url")
        .order("created_at", { ascending: false }),
      supabase
        .from("attendance")
        .select("company_id,status,date,check_in_time,check_out_time")
        .gte("date", monthStart)
        .lte("date", today),
    ]);

    if (documentsResponse.error) {
      setError(documentsResponse.error.message);
      setSupportingDataLoading(false);
      return;
    }
    if (usersResponse.error) {
      setError(usersResponse.error.message);
      setSupportingDataLoading(false);
      return;
    }
    if (attendanceResponse.error) {
      setError(attendanceResponse.error.message);
      setSupportingDataLoading(false);
      return;
    }

    const allUsers = usersResponse.data ?? [];
    setDocuments(documentsResponse.data ?? []);
    setUsers(allUsers);
    setAttendance(attendanceResponse.data ?? []);
    setCompanies((current) => buildCompanyRows(current, allUsers));
    setSupportingDataLoading(false);
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    fetchSupportingData();
  }, [supabase]);

  const usersByCompany = useMemo(
    () =>
      users.reduce((accumulator, user) => {
        if (!accumulator[user.company_id]) accumulator[user.company_id] = [];
        accumulator[user.company_id].push(user);
        return accumulator;
      }, {}),
    [users],
  );

  const docsByCompany = useMemo(
    () =>
      documents.reduce((accumulator, document) => {
        if (!accumulator[document.company_id]) accumulator[document.company_id] = [];
        accumulator[document.company_id].push(document);
        return accumulator;
      }, {}),
    [documents],
  );

  const attendanceByCompany = useMemo(
    () =>
      attendance.reduce((accumulator, row) => {
        if (!accumulator[row.company_id]) accumulator[row.company_id] = [];
        accumulator[row.company_id].push(row);
        return accumulator;
      }, {}),
    [attendance],
  );

  const metrics = useMemo(() => {
    const totalEmployees = companies.reduce((sum, company) => sum + company.employee_count, 0);
    return {
      totalCompanies: companies.length,
      pending: companies.filter((company) => company.status === "pending").length,
      active: companies.filter((company) => company.status === "approved").length,
      suspended: companies.filter((company) => company.status === "suspended").length,
      totalEmployees,
      revenue: `INR ${companies.filter((company) => company.status === "approved").length * 4900}/mo`,
    };
  }, [companies]);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === detailCompanyId || company.id === documentsCompanyId) ?? null,
    [companies, detailCompanyId, documentsCompanyId],
  );

  const companyDocumentItems = useMemo(() => {
    if (!selectedCompany) return [];

    const verificationDocs = (docsByCompany[selectedCompany.id] ?? []).map((doc) => ({
      id: doc.id,
      title: doc.document_type.replaceAll("_", " "),
      url: doc.file_url,
      type: "Company document",
    }));

    const employeeDocs = (usersByCompany[selectedCompany.id] ?? [])
      .filter((user) => user.id_proof_url)
      .map((user) => ({
        id: `id-proof-${user.id}`,
        title: `${user.name} ID proof`,
        url: user.id_proof_url,
        type: "Employee ID proof",
      }));

    return [...verificationDocs, ...employeeDocs];
  }, [docsByCompany, selectedCompany, usersByCompany]);

  const detailStats = useMemo(() => {
    if (!selectedCompany) return null;
    const rows = attendanceByCompany[selectedCompany.id] ?? [];
    const today = getToday();
    const completedRows = rows.filter((row) => row.check_in_time && row.check_out_time);
    const avgHours =
      completedRows.length > 0
        ? completedRows.reduce((sum, row) => sum + hoursBetween(row.check_in_time, row.check_out_time), 0) / completedRows.length
        : 0;

    return {
      present: rows.filter((row) => row.status === "present").length,
      late: rows.filter((row) => row.status === "late").length,
      todayMarked: rows.filter((row) => row.date === today).length,
      avgHours,
    };
  }, [attendanceByCompany, selectedCompany]);

  const setStatus = async (id, newStatus) => {
    console.log("Setting", id, "to", newStatus);
    setActionId(`${id}-${newStatus}`);

    const { data, error: updateError } = await supabase
      .from("companies")
      .update({ status: newStatus })
      .eq("id", id)
      .select();

    console.log("Result:", data, updateError);

    if (updateError) {
      alert(`Failed: ${updateError.message}`);
      setActionId("");
      return;
    }

    if (!data?.length) {
      alert("Nothing updated - RLS blocking");
      setActionId("");
      return;
    }

    setCompanies((prev) =>
      buildCompanyRows(
        prev.map((company) => (company.id === id ? { ...company, status: newStatus } : company)),
      ),
    );
    setActionId("");
  };

  const renderActionButtons = (company) => (
    <div className="action-column">
        <button
          type="button"
          className="primary-button"
          onClick={() => setStatus(company.id, "approved")}
          disabled={company.status === "approved" || actionId === `${company.id}-approved`}
        >
          {actionId === `${company.id}-approved` ? "Saving..." : company.status === "suspended" ? "Reactivate" : "Approve"}
      </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setStatus(company.id, "suspended")}
          disabled={company.status !== "approved" || actionId === `${company.id}-suspended`}
        >
          {actionId === `${company.id}-suspended` ? "Suspending..." : "Suspend"}
      </button>
        <button
          type="button"
          className="link-button danger"
          onClick={() => setStatus(company.id, "rejected")}
          disabled={company.status === "rejected" || actionId === `${company.id}-rejected`}
        >
          {actionId === `${company.id}-rejected` ? "Rejecting..." : "Reject"}
      </button>
    </div>
  );

  return (
    <section className="page-stack">
      {!!error && <div className="alert error">{error}</div>}
      {!!message && <div className="alert success">{message}</div>}

      {loading || supportingDataLoading ? <div className="panel empty-state">Loading companies...</div> : null}

      {!loading && !supportingDataLoading ? <div className="stat-grid">
        <div className="stat-card">
          <span>Total companies</span>
          <strong>{metrics.totalCompanies}</strong>
        </div>
        <div className="stat-card">
          <span>Pending approval</span>
          <strong>{metrics.pending}</strong>
        </div>
        <div className="stat-card">
          <span>Active companies</span>
          <strong>{metrics.active}</strong>
        </div>
        <div className="stat-card">
          <span>Suspended companies</span>
          <strong>{metrics.suspended}</strong>
        </div>
        <div className="stat-card">
          <span>Total employees</span>
          <strong>{metrics.totalEmployees}</strong>
        </div>
        <div className="stat-card">
          <span>Revenue indicator</span>
          <strong>{metrics.revenue}</strong>
        </div>
      </div> : null}

      {!loading && !supportingDataLoading ? <div className="panel">
        <div className="section-header">
          <h2>Company Management</h2>
          <p>Approve, suspend, reactivate, and review every company from one workspace.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company name</th>
                <th>GST number</th>
                <th>Owner email</th>
                <th>Registered date</th>
                <th>Employee count</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>
                    <strong>{company.name}</strong>
                    <div className="table-subtext">{company.company_code}</div>
                  </td>
                  <td>{company.gst_number}</td>
                  <td>{company.owner?.email ?? "--"}</td>
                  <td>{formatDate(company.created_at)}</td>
                  <td>{company.employee_count}</td>
                  <td>
                    <span className={`status-pill ${company.status}`}>{company.status}</span>
                  </td>
                  <td>
                    <div className="action-column">
                      {renderActionButtons(company)}
                      <button type="button" className="ghost-button" onClick={() => setDocumentsCompanyId(company.id)}>
                        View Documents
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setDetailCompanyId(company.id)}>
                        View Details
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
      </div> : null}

      {documentsCompanyId && selectedCompany ? (
        <DetailModal title={`${selectedCompany.name} Documents`} onClose={() => setDocumentsCompanyId("")}>
          <div className="document-grid">
            {companyDocumentItems.map((doc) => (
              <article key={doc.id} className="mini-card document-card">
                <strong>{doc.title}</strong>
                <span className="table-subtext">{doc.type}</span>
                {isPreviewableImage(doc.url) ? <img src={doc.url} alt={doc.title} className="document-preview" /> : null}
                <div className="row-end">
                  <a className="ghost-button" href={doc.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  <a className="primary-button" href={doc.url} download>
                    Download
                  </a>
                </div>
              </article>
            ))}
            {!companyDocumentItems.length ? <div className="empty-state">No documents uploaded for this company yet.</div> : null}
          </div>
        </DetailModal>
      ) : null}

      {detailCompanyId && selectedCompany ? (
        <DetailModal title={selectedCompany.name} onClose={() => setDetailCompanyId("")}>
          <div className="page-stack">
            <div className="grid-two responsive">
              <div className="mini-card stack">
                <strong>Company info</strong>
                <p>Name: {selectedCompany.name}</p>
                <p>GST: {selectedCompany.gst_number}</p>
                <p>Phone: {selectedCompany.phone}</p>
                <p>Email: {selectedCompany.owner?.email ?? "--"}</p>
                <p>Registered: {formatDate(selectedCompany.created_at)}</p>
                <p>Status: {selectedCompany.status}</p>
              </div>

              <div className="mini-card stack">
                <strong>Registered admin face</strong>
                {selectedCompany.owner?.profile_photo_url ? (
                  <img
                    src={selectedCompany.owner.profile_photo_url}
                    alt={`${selectedCompany.owner.name} profile`}
                    className="document-preview"
                  />
                ) : (
                  <p>No admin face photo uploaded yet.</p>
                )}
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat-card">
                <span>Present records</span>
                <strong>{detailStats?.present ?? 0}</strong>
              </div>
              <div className="stat-card">
                <span>Late records</span>
                <strong>{detailStats?.late ?? 0}</strong>
              </div>
              <div className="stat-card">
                <span>Attendance today</span>
                <strong>{detailStats?.todayMarked ?? 0}</strong>
              </div>
              <div className="stat-card">
                <span>Avg hours</span>
                <strong>{(detailStats?.avgHours ?? 0).toFixed(1)}</strong>
              </div>
            </div>

            <div className="mini-card stack">
              <strong>Verification notes</strong>
              <textarea
                rows="4"
                value={notes[selectedCompany.id] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [selectedCompany.id]: event.target.value }))}
              />
              <div className="row-end">{renderActionButtons(selectedCompany)}</div>
            </div>

            <div className="mini-card stack">
              <strong>Employees</strong>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Email</th>
                      <th>Join date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(usersByCompany[selectedCompany.id] ?? []).map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td>{user.role}</td>
                        <td>{user.email}</td>
                        <td>{formatDate(user.created_at)}</td>
                      </tr>
                    ))}
                    {!(usersByCompany[selectedCompany.id] ?? []).length ? (
                      <tr>
                        <td colSpan="4" className="empty-cell">
                          No employees found for this company.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mini-card stack">
              <strong>Documents uploaded</strong>
              <div className="docs-list">
                {companyDocumentItems.map((doc) => (
                  <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer" className="link-button">
                    {doc.title}
                  </a>
                ))}
                {!companyDocumentItems.length ? <span className="table-subtext">No documents uploaded.</span> : null}
              </div>
            </div>
          </div>
        </DetailModal>
      ) : null}
    </section>
  );
}
