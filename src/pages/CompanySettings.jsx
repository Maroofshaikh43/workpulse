import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

export default function CompanySettings() {
  const { supabase, company, profile, refreshProfile } = useOutletContext();
  const [form, setForm] = useState({
    name: company?.name ?? "",
    gst_number: company?.gst_number ?? "",
    phone: company?.phone ?? "",
    office_lat: company?.office_lat ?? "",
    office_lng: company?.office_lng ?? "",
    attendance_radius_meters: company?.attendance_radius_meters ?? 200,
    google_drive_folder_url: company?.google_drive_folder_url ?? "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verificationFile, setVerificationFile] = useState(null);
  const [verificationType, setVerificationType] = useState("business_registration");
  const [googleIntegration, setGoogleIntegration] = useState({
    workspace_domain: "",
    drive_sync_enabled: false,
    report_folder_id: "",
    report_template_file_id: "",
    service_account_email: "",
    sync_status: "not_connected",
  });

  useEffect(() => {
    if (!company?.id) return null;
    supabase
      .from("google_workspace_integrations")
      .select("*")
      .eq("company_id", company.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setGoogleIntegration(data);
      });
    return undefined;
  }, [company?.id, supabase]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const { error: updateError } = await supabase
      .from("companies")
      .update({
        name: form.name,
        gst_number: form.gst_number,
        phone: form.phone,
        office_lat: form.office_lat === "" ? null : Number(form.office_lat),
        office_lng: form.office_lng === "" ? null : Number(form.office_lng),
        attendance_radius_meters: Number(form.attendance_radius_meters || 200),
        google_drive_folder_url: form.google_drive_folder_url || null,
      })
      .eq("id", company.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Company settings updated.");
    refreshProfile();
  };

  const handleVerificationUpload = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!verificationFile) {
      setError("Choose a verification file before uploading.");
      return;
    }

    const ext = verificationFile.name.split(".").pop();
    const path = `${company.id}/${verificationType}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("company-verification")
      .upload(path, verificationFile, { cacheControl: "3600", upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("company-verification").getPublicUrl(path);
    const { error: insertError } = await supabase.from("company_verification_documents").insert({
      company_id: company.id,
      document_type: verificationType,
      file_url: data.publicUrl,
      uploaded_by: profile.id,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }

    const { error: companyError } = await supabase
      .from("companies")
      .update({ verification_status: "under_review" })
      .eq("id", company.id);
    if (companyError) {
      setError(companyError.message);
      return;
    }

    setVerificationFile(null);
    setMessage("Verification document uploaded. Company moved to under review.");
    refreshProfile();
  };

  const handleGoogleSyncSave = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const { error: upsertError } = await supabase.from("google_workspace_integrations").upsert({
      company_id: company.id,
      workspace_domain: googleIntegration.workspace_domain || null,
      drive_sync_enabled: googleIntegration.drive_sync_enabled,
      report_folder_id: googleIntegration.report_folder_id || null,
      report_template_file_id: googleIntegration.report_template_file_id || null,
      service_account_email: googleIntegration.service_account_email || null,
      sync_status: googleIntegration.drive_sync_enabled ? "pending" : "not_connected",
    });
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setMessage("Google Workspace sync settings saved. Secure server-side credentials are required to complete live Drive sync.");
  };

  return (
    <section className="grid-two responsive">
      <div className="panel">
        <div className="section-header">
          <h2>Company Details</h2>
          <p>Review the workspace setup employees depend on for attendance and reporting.</p>
        </div>
        <div className="mini-card stack">
          <p>Company Code: {company?.company_code}</p>
          <p>Company Name: {company?.name}</p>
          <p>GST Number: {company?.gst_number}</p>
          <p>Phone: {company?.phone}</p>
          <p>Attendance Radius: {company?.attendance_radius_meters ?? 200} meters</p>
          <p>Drive Folder: {company?.google_drive_folder_url ? "Configured" : "Not configured"}</p>
          <p>Verification Status: {company?.verification_status ?? "pending"}</p>
          <p>Verification Notes: {company?.verification_notes ?? "No notes yet."}</p>
        </div>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Operations Settings</h2>
          <p>Set office GPS first, then configure the company Drive folder used for external daily reports.</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        {!!message && <div className="alert success">{message}</div>}
        <form onSubmit={handleSubmit} className="stack">
          <label>
            Company Name
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          </label>
          <div className="grid-two">
            <label>
              GST Number
              <input
                value={form.gst_number}
                onChange={(event) => setForm((current) => ({ ...current, gst_number: event.target.value }))}
                required
              />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} required />
            </label>
          </div>
          <div className="grid-two">
            <label>
              Office Latitude
              <input
                type="number"
                step="any"
                value={form.office_lat}
                onChange={(event) => setForm((current) => ({ ...current, office_lat: event.target.value }))}
              />
            </label>
            <label>
              Office Longitude
              <input
                type="number"
                step="any"
                value={form.office_lng}
                onChange={(event) => setForm((current) => ({ ...current, office_lng: event.target.value }))}
              />
            </label>
          </div>
          <label>
            Attendance Radius (Meters)
            <input
              type="number"
              min="50"
              value={form.attendance_radius_meters}
              onChange={(event) =>
                setForm((current) => ({ ...current, attendance_radius_meters: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Company Google Drive Folder URL
            <input
              type="url"
              placeholder="https://drive.google.com/drive/folders/..."
              value={form.google_drive_folder_url}
              onChange={(event) =>
                setForm((current) => ({ ...current, google_drive_folder_url: event.target.value }))
              }
            />
          </label>
          <button className="primary-button" type="submit">
            Save Settings
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Company Verification</h2>
          <p>Upload supporting documents for super-admin review. Employees can join only after approval.</p>
        </div>
        <form onSubmit={handleVerificationUpload} className="stack">
          <label>
            Document Type
            <select value={verificationType} onChange={(event) => setVerificationType(event.target.value)}>
              <option value="business_registration">Business Registration</option>
              <option value="gst_certificate">GST Certificate</option>
              <option value="address_proof">Address Proof</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Upload Verification File
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(event) => setVerificationFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="ghost-button" type="submit">
            Upload Verification Proof
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="section-header">
          <h2>Google Workspace Sync</h2>
          <p>Prepare real Drive synchronization now. Secure backend credentials are still required for live API sync.</p>
        </div>
        <form onSubmit={handleGoogleSyncSave} className="stack">
          <label>
            Workspace Domain
            <input
              placeholder="company.com"
              value={googleIntegration.workspace_domain ?? ""}
              onChange={(event) => setGoogleIntegration((current) => ({ ...current, workspace_domain: event.target.value }))}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={!!googleIntegration.drive_sync_enabled}
              onChange={(event) =>
                setGoogleIntegration((current) => ({ ...current, drive_sync_enabled: event.target.checked }))
              }
            />
            Enable Google Drive sync
          </label>
          <div className="grid-two">
            <label>
              Report Folder ID
              <input
                value={googleIntegration.report_folder_id ?? ""}
                onChange={(event) =>
                  setGoogleIntegration((current) => ({ ...current, report_folder_id: event.target.value }))
                }
              />
            </label>
            <label>
              Template File ID
              <input
                value={googleIntegration.report_template_file_id ?? ""}
                onChange={(event) =>
                  setGoogleIntegration((current) => ({ ...current, report_template_file_id: event.target.value }))
                }
              />
            </label>
          </div>
          <label>
            Service Account Email
            <input
              type="email"
              value={googleIntegration.service_account_email ?? ""}
              onChange={(event) =>
                setGoogleIntegration((current) => ({ ...current, service_account_email: event.target.value }))
              }
            />
          </label>
          <div className="mini-card">
            <strong>Current Sync Status</strong>
            <p>{googleIntegration.sync_status ?? "not_connected"}</p>
          </div>
          <button className="ghost-button" type="submit">
            Save Google Sync Settings
          </button>
        </form>
      </div>
    </section>
  );
}
