import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function initialEmployeeForm() {
  return {
    name: "",
    email: "",
    phone: "",
    department: "",
    password: "",
    profilePhoto: null,
    profilePhotoPreview: "",
    idProof: null,
    businessProof: null,
    gstProof: null,
  };
}

function hasRecoveryTokens() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return hash.includes("type=recovery") || search.includes("type=recovery");
}

const EMAIL_CONFIRMATION_MESSAGE =
  "Account created! Please check your email and click the confirmation link to activate your account. Only confirmed accounts can log in.";

export default function Auth({ supabase, authError, onRegistered }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [successCode, setSuccessCode] = useState("");
  const [verifiedCompany, setVerifiedCompany] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: "", confirmPassword: "" });
  const [adminForm, setAdminForm] = useState({
    companyName: "",
    gstNumber: "",
    phone: "",
    email: "",
    password: "",
    businessProof: null,
    gstProof: null,
  });
  const [companyCodeInput, setCompanyCodeInput] = useState("");
  const [employeeForm, setEmployeeForm] = useState(initialEmployeeForm());

  const title = useMemo(() => {
    if (mode === "admin") return "Register as Admin";
    if (mode === "employee-code" || mode === "employee-details") return "Register as Employee";
    if (mode === "forgot-password") return "Reset Password";
    if (mode === "reset-password") return "Create New Password";
    return "Login";
  }, [mode]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (cameraReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraReady]);

  useEffect(() => {
    if (hasRecoveryTokens()) {
      resetMessages();
      setMode("reset-password");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        resetMessages();
        setMode("reset-password");
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const resetMessages = () => {
    setMessage("");
    setError("");
    setSuccessCode("");
  };

  const resetCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  const findExistingUserRole = async (email) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.from("users").select("role").eq("email", normalizedEmail).maybeSingle();

    if (error) throw error;
    return data?.role ?? null;
  };

  const getRoleDestination = async (userId) => {
    const { data: superAdminData, error: superAdminError } = await supabase
      .from("platform_super_admins")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (superAdminError) throw superAdminError;
    if (superAdminData) return "/super-admin";

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    if (userError) throw userError;

    if (userData.role === "employee") return "/app/attendance";
    if (userData.role === "admin" || userData.role === "hr") return "/app/overview";
    return "/app";
  };

  const generateCompanyCode = async () => {
    let attempts = 0;
    while (attempts < 10) {
      const code = String(Math.floor(1000000000 + Math.random() * 9000000000));
      const { data } = await supabase.from("companies").select("id").eq("company_code", code).maybeSingle();
      if (!data) return code;
      attempts += 1;
    }
    throw new Error("Unable to generate a unique company code. Please try again.");
  };

  const uploadFile = async (bucket, file, path) => {
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  const openProfileCamera = async () => {
    setError("");
    try {
      resetCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCameraReady(true);
    } catch (cameraError) {
      setError(`Camera access failed: ${cameraError.message}`);
    }
  };

  const captureProfilePhoto = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(videoRef.current, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setError("Unable to capture your profile photo. Please try again.");
      return;
    }

    const capturedFile = new File([blob], "live-profile.jpg", { type: "image/jpeg" });
    setEmployeeForm((current) => ({
      ...current,
      profilePhoto: capturedFile,
      profilePhotoPreview: canvas.toDataURL("image/jpeg", 0.92),
    }));
    resetCamera();
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginForm.email.trim().toLowerCase(),
        password: loginForm.password,
      });

      if (signInError) throw signInError;
      if (!signInData.user) throw new Error("We could not load your account.");

      const destination = await getRoleDestination(signInData.user.id);
      setMessage("Login successful. Loading your dashboard...");
      navigate(destination, { replace: true });
    } catch (signInError) {
      if (signInError.message?.toLowerCase().includes("email not confirmed")) {
        setError("Verify your email from the confirmation link before signing in.");
      } else {
        setError(signInError.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    resetMessages();
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
      redirectTo: "http://localhost:5173/reset-password",
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Password reset link sent! Check your email inbox.");
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    resetMessages();

    if (resetPasswordForm.password.length < 6) {
      setError("Use a password with at least 6 characters.");
      return;
    }

    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: resetPasswordForm.password,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setResetPasswordForm({ password: "", confirmPassword: "" });
    window.history.replaceState({}, document.title, "/login");
    setMode("login");
    setMessage("Your password has been updated. Sign in with your new password.");
  };

  const handleResendVerification = async () => {
    resetMessages();

    if (!loginForm.email) {
      setError("Enter your email first so we know where to resend the verification link.");
      return;
    }

    setLoading(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: loginForm.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    setLoading(false);

    if (resendError) {
      setError(resendError.message);
      return;
    }

    setMessage("Verification email sent again. Check your inbox and spam folder.");
  };

  const handleAdminRegister = async (event) => {
    event.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      const normalizedEmail = adminForm.email.trim().toLowerCase();
      const existingRole = await findExistingUserRole(normalizedEmail);

      if (existingRole === "employee") {
        throw new Error("This email is already registered as an Employee. Please use the Login button.");
      }

      if (existingRole === "hr") {
        throw new Error("This email is already registered with your company workspace. Please use the Login button.");
      }

      if (existingRole === "admin") {
        throw new Error("This email is already registered as a Company Admin. Please use the Login button.");
      }

      const companyCode = await generateCompanyCode();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: adminForm.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Supabase did not return a user for the admin registration.");

      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .insert({
          name: adminForm.companyName,
          gst_number: adminForm.gstNumber,
          phone: adminForm.phone,
          company_code: companyCode,
          verification_status: "pending",
        })
        .select()
        .single();

      if (companyError) throw companyError;

      const { error: profileError } = await supabase.from("users").insert({
        id: signUpData.user.id,
        company_id: companyData.id,
        name: adminForm.companyName,
        email: normalizedEmail,
        phone: adminForm.phone,
        department: "Management",
        role: "admin",
        is_active: true,
      });

      if (profileError) {
        await supabase.auth.signOut();
        throw new Error("We could not finish setting up this company admin account. Please try again.");
      }

      const verificationDocs = [];
      if (adminForm.businessProof) {
        const businessExt = adminForm.businessProof.name.split(".").pop();
        const businessProofUrl = await uploadFile(
          "company-verification",
          adminForm.businessProof,
          `${companyData.id}/${signUpData.user.id}/business-proof.${businessExt}`,
        );
        verificationDocs.push({
          company_id: companyData.id,
          document_type: "business_registration",
          file_url: businessProofUrl,
          uploaded_by: signUpData.user.id,
        });
      }
      if (adminForm.gstProof) {
        const gstExt = adminForm.gstProof.name.split(".").pop();
        const gstProofUrl = await uploadFile(
          "company-verification",
          adminForm.gstProof,
          `${companyData.id}/${signUpData.user.id}/gst-proof.${gstExt}`,
        );
        verificationDocs.push({
          company_id: companyData.id,
          document_type: "gst_certificate",
          file_url: gstProofUrl,
          uploaded_by: signUpData.user.id,
        });
      }

      if (verificationDocs.length) {
        const { error: docsError } = await supabase.from("company_verification_documents").insert(verificationDocs);
        if (docsError) throw docsError;
      }

      await supabase.auth.signOut();
      onRegistered();
      setSuccessCode(companyCode);
      setMessage(EMAIL_CONFIRMATION_MESSAGE);
      setAdminForm({
        companyName: "",
        gstNumber: "",
        phone: "",
        email: "",
        password: "",
        businessProof: null,
        gstProof: null,
      });
      setMode("login");
    } catch (registrationError) {
      setError(registrationError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCompanyCode = async (event) => {
    event.preventDefault();
    resetMessages();
    setLoading(true);
    const { data, error: verifyError } = await supabase
      .from("companies")
      .select("id,name,company_code,verification_status,status")
      .eq("company_code", companyCodeInput)
      .single();
    setLoading(false);
    if (verifyError) {
      setError("Invalid company code.");
      return;
    }
    if (data.status && data.status !== "approved") {
      setError("This company is not active yet. Employees can join only after approval.");
      return;
    }
    if (!data.status && data.verification_status !== "verified") {
      setError("This company is not verified yet. Employees can join only after approval.");
      return;
    }
    setVerifiedCompany(data);
    setMode("employee-details");
  };

  const handleEmployeeRegister = async (event) => {
    event.preventDefault();
    resetMessages();

    if (!employeeForm.profilePhoto) {
      setError("A live camera profile capture is required.");
      return;
    }

    if (!verifiedCompany) {
      setError("Please verify the company code first.");
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = employeeForm.email.trim().toLowerCase();
      const existingRole = await findExistingUserRole(normalizedEmail);

      if (existingRole === "admin") {
        throw new Error("This email is already registered as a Company Admin. Please use the Login button.");
      }

      if (existingRole === "hr") {
        throw new Error("This email is already registered with your company workspace. Please use the Login button.");
      }

      if (existingRole === "employee") {
        throw new Error("This email is already registered as an Employee. Please use the Login button.");
      }

      const tempUploadKey = crypto.randomUUID();
      const profilePhotoUrl = await uploadFile(
        "profile-photos",
        employeeForm.profilePhoto,
        `${verifiedCompany.id}/${tempUploadKey}/profile.jpg`,
      );

      let idProofUrl = null;
      if (employeeForm.idProof) {
        const idExt = employeeForm.idProof.name.split(".").pop();
        idProofUrl = await uploadFile(
          "id-proofs",
          employeeForm.idProof,
          `${verifiedCompany.id}/${tempUploadKey}/id-proof.${idExt}`,
        );
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: employeeForm.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Supabase did not return a user for this registration.");

      const { error: insertError } = await supabase.from("users").insert({
        id: signUpData.user.id,
        company_id: verifiedCompany.id,
        name: employeeForm.name,
        email: normalizedEmail,
        phone: employeeForm.phone,
        department: employeeForm.department,
        role: "employee",
        profile_photo_url: profilePhotoUrl,
        id_proof_url: idProofUrl,
        is_active: true,
      });
      if (insertError) {
        await supabase.auth.signOut();
        throw new Error("We could not finish creating this employee account. Please try again.");
      }

      await supabase.auth.signOut();
      onRegistered();
      setMessage(EMAIL_CONFIRMATION_MESSAGE);
      setEmployeeForm(initialEmployeeForm());
      setVerifiedCompany(null);
      setCompanyCodeInput("");
      setMode("login");
    } catch (registrationError) {
      setError(registrationError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-route-shell">
      <header className="marketing-header auth-header">
        <Link to="/" className="public-brand">
          <span className="public-brand-mark">WP</span>
          <span className="public-brand-text">WorkPulse</span>
        </Link>
      </header>

      <div className="auth-center">
        <aside className="auth-showcase">
          <Link to="/" className="public-brand">
            <span className="public-brand-mark">WP</span>
            <span className="public-brand-text">WorkPulse</span>
          </Link>
          <div className="stack">
            <h2>Operations software your team will enjoy using.</h2>
            <p>WorkPulse gives growing companies one clean place to run attendance, approvals, and workforce workflows.</p>
          </div>
          <ul className="auth-bullet-list">
            <li>Attendance and HR workflows in one system</li>
            <li>Role-based access for admins, HR, and employees</li>
            <li>Clean reporting, payroll, and approval tracking</li>
          </ul>
        </aside>

        <div className="auth-form-panel">
          <div className="auth-minimal-card">
            <div className="auth-card-brand">
              <span className="public-brand-mark">WP</span>
              <strong>WorkPulse</strong>
            </div>

            <div className="section-header auth-card-header">
              <h1>{mode === "login" ? "Welcome back" : title}</h1>
              <p>Secure access for your team workspace.</p>
            </div>

            {!!authError && <div className="alert error">{authError}</div>}
            {!!error && <div className="alert error">{error}</div>}
            {!!message && <div className="alert success">{message}</div>}
            {!!successCode && (
              <div className="alert success">
                Company code: <strong>{successCode}</strong>
              </div>
            )}

            {mode === "login" && (
              <form onSubmit={handleLogin} className="stack">
                <label>
                  Email
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                    required
                  />
                </label>
                <button className="primary-button full-width" type="submit" disabled={loading}>
                  {loading ? "Signing In..." : "Login"}
                </button>
                <div className="auth-link-list">
                  <button type="button" className="text-button" onClick={() => setMode("admin")}>
                    Register a Company
                  </button>
                  <button type="button" className="text-button" onClick={() => setMode("employee-code")}>
                    Register as Employee
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      resetMessages();
                      setForgotPasswordEmail(loginForm.email);
                      setMode("forgot-password");
                    }}
                  >
                    Forgot Password
                  </button>
                  <button type="button" className="text-button" onClick={handleResendVerification} disabled={loading}>
                    Resend Verification
                  </button>
                </div>
              </form>
            )}

            {mode === "forgot-password" && (
              <form onSubmit={handleForgotPassword} className="stack">
                <label>
                  Email
                  <input
                    type="email"
                    value={forgotPasswordEmail}
                    onChange={(event) => setForgotPasswordEmail(event.target.value)}
                    required
                  />
                </label>
                <button className="primary-button full-width" type="submit" disabled={loading}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
                <button type="button" className="text-button" onClick={() => setMode("login")}>
                  Back to Login
                </button>
              </form>
            )}

            {mode === "reset-password" && (
              <form onSubmit={handleResetPassword} className="stack">
                <label>
                  New Password
                  <input
                    type="password"
                    value={resetPasswordForm.password}
                    onChange={(event) =>
                      setResetPasswordForm((current) => ({ ...current, password: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Confirm Password
                  <input
                    type="password"
                    value={resetPasswordForm.confirmPassword}
                    onChange={(event) =>
                      setResetPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                    }
                    required
                  />
                </label>
                <button className="primary-button full-width" type="submit" disabled={loading}>
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </form>
            )}

          {mode === "admin" && (
            <form onSubmit={handleAdminRegister} className="stack">
              <div className="grid-two">
                <label>
                  Company Name
                  <input
                    value={adminForm.companyName}
                    onChange={(event) =>
                      setAdminForm((current) => ({ ...current, companyName: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  GST Number
                  <input
                    value={adminForm.gstNumber}
                    onChange={(event) => setAdminForm((current) => ({ ...current, gstNumber: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={adminForm.phone}
                    onChange={(event) => setAdminForm((current) => ({ ...current, phone: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={adminForm.email}
                    onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </label>
              </div>
              <label>
                Password
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))}
                  required
                />
              </label>
              <div className="grid-two">
                <label>
                  Business Proof
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(event) =>
                      setAdminForm((current) => ({ ...current, businessProof: event.target.files?.[0] ?? null }))
                    }
                    required
                  />
                </label>
                <label>
                  GST Certificate
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(event) =>
                      setAdminForm((current) => ({ ...current, gstProof: event.target.files?.[0] ?? null }))
                    }
                  />
                </label>
              </div>
              <button className="primary-button full-width" type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Admin Account"}
              </button>
              <button type="button" className="text-button" onClick={() => setMode("login")}>
                Back to Login
              </button>
            </form>
          )}

          {mode === "employee-code" && (
            <form onSubmit={handleVerifyCompanyCode} className="stack">
              <label>
                Company Code
                <input
                  inputMode="numeric"
                  minLength={10}
                  maxLength={10}
                  value={companyCodeInput}
                  onChange={(event) => setCompanyCodeInput(event.target.value.replace(/\D/g, "").slice(0, 10))}
                  required
                />
              </label>
              <button className="primary-button full-width" type="submit" disabled={loading}>
                {loading ? "Verifying..." : "Verify Company Code"}
              </button>
              <button type="button" className="text-button" onClick={() => setMode("login")}>
                Back to Login
              </button>
            </form>
          )}

          {mode === "employee-details" && verifiedCompany && (
            <form onSubmit={handleEmployeeRegister} className="stack">
              <div className="inline-banner">
                <strong>{verifiedCompany.name}</strong>
                <span>Email verification is required before first login.</span>
              </div>
              <div className="grid-two">
                <label>
                  Full Name
                  <input
                    value={employeeForm.name}
                    onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Work Email
                  <input
                    type="email"
                    value={employeeForm.email}
                    onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={employeeForm.phone}
                    onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Department
                  <input
                    value={employeeForm.department}
                    onChange={(event) =>
                      setEmployeeForm((current) => ({ ...current, department: event.target.value }))
                    }
                    required
                  />
                </label>
              </div>
              <label>
                Password
                <input
                  type="password"
                  value={employeeForm.password}
                  onChange={(event) => setEmployeeForm((current) => ({ ...current, password: event.target.value }))}
                  required
                />
              </label>
              <div className="camera-onboarding">
                {!cameraReady && !employeeForm.profilePhotoPreview && (
                  <button type="button" className="ghost-button" onClick={openProfileCamera}>
                    Open Live Camera
                  </button>
                )}
                {cameraReady && (
                  <div className="camera-card">
                    <video ref={videoRef} autoPlay playsInline className="camera-view" />
                    <div className="row-end">
                      <button type="button" className="ghost-button" onClick={resetCamera}>
                        Cancel
                      </button>
                      <button type="button" className="primary-button" onClick={captureProfilePhoto}>
                        Capture Photo
                      </button>
                    </div>
                  </div>
                )}
                {employeeForm.profilePhotoPreview && (
                  <div className="capture-result">
                    <img src={employeeForm.profilePhotoPreview} alt="Live profile capture preview" className="photo-preview" />
                    <div className="mini-card">
                      <strong>Live capture ready</strong>
                      <p>This image will be stored as the employee profile photo after signup completes.</p>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() =>
                          setEmployeeForm((current) => ({
                            ...current,
                            profilePhoto: null,
                            profilePhotoPreview: "",
                          }))
                        }
                      >
                        Retake Photo
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <label>
                Photo ID
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(event) =>
                    setEmployeeForm((current) => ({ ...current, idProof: event.target.files?.[0] ?? null }))
                  }
                />
              </label>
              <div className="row-end">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    resetCamera();
                    setMode("employee-code");
                    setVerifiedCompany(null);
                  }}
                >
                  Back
                </button>
                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? "Registering..." : "Create Employee Account"}
                </button>
              </div>
            </form>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
