import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

function createFormState(company) {
  return {
    name: company?.name ?? "",
    gst_number: company?.gst_number ?? "",
    phone: company?.phone ?? "",
    office_lat: company?.office_lat ?? "",
    office_lng: company?.office_lng ?? "",
    attendance_radius_meters: company?.attendance_radius_meters ?? 200,
  };
}

export default function CompanySettings() {
  const { supabase, company, profile, refreshProfile } = useOutletContext();
  const [companyRecord, setCompanyRecord] = useState(company ?? null);
  const [form, setForm] = useState(createFormState(company));
  const [officeLat, setOfficeLat] = useState(company?.office_lat ?? "");
  const [officeLng, setOfficeLng] = useState(company?.office_lng ?? "");
  const [officeRadius, setOfficeRadius] = useState(company?.attendance_radius_meters ?? 200);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verificationFile, setVerificationFile] = useState(null);
  const [verificationType, setVerificationType] = useState("business_registration");
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingVerification, setUploadingVerification] = useState(false);
  const [loadingCompany, setLoadingCompany] = useState(true);

  const applyCompanyRecord = (nextCompany) => {
    setCompanyRecord(nextCompany);
    setForm(createFormState(nextCompany));
    setOfficeLat(nextCompany?.office_lat ?? "");
    setOfficeLng(nextCompany?.office_lng ?? "");
    setOfficeRadius(nextCompany?.attendance_radius_meters ?? 200);
  };

  const loadSettings = async () => {
    if (!profile?.company_id) return;
    setLoadingCompany(true);
    const { data, error: fetchError } = await supabase
      .from("companies")
      .select("office_lat, office_lng, attendance_radius_meters, name, gst_number, phone, company_code, verification_status, verification_notes")
      .eq("id", profile.company_id)
      .single();

    if (fetchError) {
      setError(fetchError.message);
      setLoadingCompany(false);
      return;
    }
    applyCompanyRecord(data);
    setLoadingCompany(false);
  };

  useEffect(() => {
    loadSettings();
  }, [profile?.company_id, supabase]);

  const saveOfficeLocation = async () => {
    setMessage("");
    setError("");
    setSavingSettings(true);

    const { data, error: updateError } = await supabase
      .from("companies")
      .update({
        name: form.name,
        gst_number: form.gst_number,
        phone: form.phone,
        office_lat: officeLat === "" ? null : Number.parseFloat(officeLat),
        office_lng: officeLng === "" ? null : Number.parseFloat(officeLng),
        attendance_radius_meters: Number.parseFloat(officeRadius) || 200,
      })
      .eq("id", profile.company_id)
      .select();

    setSavingSettings(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (data?.[0]) applyCompanyRecord(data[0]);
    await loadSettings();
    await refreshProfile();
    setMessage("Settings saved successfully.");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await saveOfficeLocation();
  };

  const getCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOfficeLat(pos.coords.latitude);
        setOfficeLng(pos.coords.longitude);
      },
      () => setError("Location access denied."),
    );
  };

  const handleVerificationUpload = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setUploadingVerification(true);

    if (!verificationFile) {
      setError("Choose a verification file before uploading.");
      setUploadingVerification(false);
      return;
    }

    const ext = verificationFile.name.split(".").pop();
    const path = `${profile.company_id}/${verificationType}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("company-verification")
      .upload(path, verificationFile, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setUploadingVerification(false);
      return;
    }

    const { data } = supabase.storage.from("company-verification").getPublicUrl(path);
    const { error: insertError } = await supabase.from("company_verification_documents").insert({
      company_id: profile.company_id,
      document_type: verificationType,
      file_url: data.publicUrl,
      uploaded_by: profile.id,
    });

    if (insertError) {
      setError(insertError.message);
      setUploadingVerification(false);
      return;
    }

    const { error: companyError } = await supabase
      .from("companies")
      .update({ verification_status: "under_review" })
      .eq("id", profile.company_id);

    if (companyError) {
      setError(companyError.message);
      setUploadingVerification(false);
      return;
    }

    setVerificationFile(null);
    setUploadingVerification(false);
    await loadSettings();
    await refreshProfile();
    setMessage("Verification document uploaded. Company moved to under review.");
  };

  if (loadingCompany) {
    return <section className="panel empty-state">Loading company settings...</section>;
  }

  return (
    <section className="grid-two responsive">

      {/* Company Details */}
      <div className="panel">
        <div className="section-header">
          <h2>Company Details</h2>
          <p>Overview of your workspace configuration.</p>
        </div>
        <div className="mini-card stack">
          <p>Company Code: <strong>{companyRecord?.company_code}</strong></p>
          <p>Company Name: <strong>{companyRecord?.name}</strong></p>
          <p>GST Number: <strong>{companyRecord?.gst_number}</strong></p>
          <p>Phone: <strong>{companyRecord?.phone}</strong></p>
          <p>Attendance Radius: <strong>{companyRecord?.attendance_radius_meters ?? 200} meters</strong></p>
          <p>Verification Status: <strong>{companyRecord?.verification_status ?? "pending"}</strong></p>
          {companyRecord?.verification_notes && (
            <p>Verification Notes: <strong>{companyRecord.verification_notes}</strong></p>
          )}
        </div>
      </div>

      {/* Operations Settings */}
      <div className="panel">
        <div className="section-header">
          <h2>Operations Settings</h2>
          <p>Set your office GPS coordinates and attendance radius.</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        {!!message && <div className="alert success">{message}</div>}
        <form onSubmit={handleSubmit} className="stack">
          <label>
            Company Name
            <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} required />
          </label>
          <div className="grid-two">
            <label>
              GST Number
              <input value={form.gst_number} onChange={(e) => setForm((c) => ({ ...c, gst_number: e.target.value }))} required />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} required />
            </label>
          </div>
          <div className="grid-two">
            <label>
              Office Latitude
              <input type="number" step="any" value={officeLat} onChange={(e) => setOfficeLat(e.target.value)} />
            </label>
            <label>
              Office Longitude
              <input type="number" step="any" value={officeLng} onChange={(e) => setOfficeLng(e.target.value)} />
            </label>
          </div>
          <button type="button" className="ghost-button" onClick={getCurrentLocation}>
            📍 Use My Current Location
          </button>
          <label>
            Attendance Radius (Meters)
            <input
              type="number"
              min="50"
              value={officeRadius}
              onChange={(e) => setOfficeRadius(e.target.value)}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={savingSettings}>
            {savingSettings ? "Saving..." : "Save Settings"}
          </button>
        </form>
      </div>

      {/* Company Verification */}
      <div className="panel">
        <div className="section-header">
          <h2>Company Verification</h2>
          <p>Upload supporting documents for super-admin review. Employees can join only after approval.</p>
        </div>
        <form onSubmit={handleVerificationUpload} className="stack">
          <label>
            Document Type
            <select value={verificationType} onChange={(e) => setVerificationType(e.target.value)}>
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
              onChange={(e) => setVerificationFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="ghost-button" type="submit" disabled={uploadingVerification}>
            {uploadingVerification ? "Uploading..." : "Upload Verification Proof"}
          </button>
        </form>
      </div>

    </section>
  );
}
