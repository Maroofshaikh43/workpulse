import { useEffect, useMemo, useRef, useState } from "react";

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

export default function Auth({ supabase, authError, onRegistered }) {
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
    if (mode === "admin") return "Launch Your Company Workspace";
    if (mode === "employee-code" || mode === "employee-details") return "Verified Employee Onboarding";
    if (mode === "forgot-password") return "Reset Access";
    if (mode === "reset-password") return "Set A New Password";
    return "Sign In Securely";
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
    const { error: signInError } = await supabase.auth.signInWithPassword(loginForm);
    setLoading(false);
    if (signInError) {
      if (signInError.message.toLowerCase().includes("email not confirmed")) {
        setError("Verify your email from the confirmation link before signing in.");
        return;
      }
      setError(signInError.message);
      return;
    }
    setMessage("Login successful. Loading your dashboard...");
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    resetMessages();
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
      redirectTo: `${window.location.origin}/auth`,
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Password reset link sent. Check your email to continue.");
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
    window.history.replaceState({}, document.title, "/auth");
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
      const companyCode = await generateCompanyCode();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: adminForm.email,
        password: adminForm.password,
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
        email: adminForm.email,
        phone: adminForm.phone,
        department: "Management",
        role: "admin",
        is_active: true,
      });

      if (profileError) throw profileError;

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
      setMessage("Admin account created. Company verification is now pending super-admin review.");
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
      .select("id,name,company_code,verification_status")
      .eq("company_code", companyCodeInput)
      .single();
    setLoading(false);
    if (verifyError) {
      setError("Invalid company code.");
      return;
    }
    if (data.verification_status !== "verified") {
      setError("This company is not verified yet. Employees can join only after super-admin approval.");
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
        email: employeeForm.email,
        password: employeeForm.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Supabase did not return a user for this registration.");

      const { error: insertError } = await supabase.from("users").insert({
        id: signUpData.user.id,
        company_id: verifiedCompany.id,
        name: employeeForm.name,
        email: employeeForm.email,
        phone: employeeForm.phone,
        department: employeeForm.department,
        role: "employee",
        profile_photo_url: profilePhotoUrl,
        id_proof_url: idProofUrl,
        is_active: true,
      });
      if (insertError) throw insertError;

      await supabase.auth.signOut();

      onRegistered();
      setMessage("Registration saved. Verify your email before signing in.");
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
    <div className="screen-centered auth-screen">
      <div className="auth-hero">
        <div className="brand-pill">Trusted Attendance Infrastructure For Modern Teams</div>
        <div className="hero-kicker">WorkPulse</div>
        <h1>HR operations, attendance control, and daily execution in one secure workspace.</h1>
        <p>
          Built for companies that need accountable attendance, role-based control, verified onboarding,
          and a cleaner way to run people operations without spreadsheets and WhatsApp follow-ups.
        </p>

        <div className="hero-proofbar">
          <div>
            <strong>GPS + face checks</strong>
            <span>Attendance only inside approved office range</span>
          </div>
          <div>
            <strong>Super-admin review</strong>
            <span>Company verification before employee onboarding</span>
          </div>
          <div>
            <strong>Built for scale</strong>
            <span>Multi-company roles, assets, alerts, and reporting</span>
          </div>
        </div>

        <div className="hero-grid">
          <div className="mini-card feature-card">
            <div className="card-chip">Secure onboarding</div>
            <strong>Verified employee access</strong>
            <p>Company-code registration, live profile capture, email confirmation, and admin-controlled roles.</p>
          </div>
          <div className="mini-card feature-card">
            <div className="card-chip">Operational visibility</div>
            <strong>Attendance with context</strong>
            <p>GPS-gated check-in, checkout guardrails, leave review flows, and real-time dashboard monitoring.</p>
          </div>
          <div className="mini-card feature-card">
            <div className="card-chip">Manager control</div>
            <strong>Reports, assets, and alerts</strong>
            <p>Smart alerts, asset assignments, salary records, notifications, and linked reporting workflows.</p>
          </div>
        </div>
      </div>

      <div className="panel auth-panel">
        <div className="panel-ribbon">
          <span>Production Workspace</span>
          <span>Role Based</span>
          <span>Verification Ready</span>
        </div>
        <div className="auth-switcher">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            onClick={() => {
              resetMessages();
              resetCamera();
              setMode("login");
            }}
          >
            Login
          </button>
          <button
            className={mode === "admin" ? "active" : ""}
            type="button"
            onClick={() => {
              resetMessages();
              resetCamera();
              setMode("admin");
            }}
          >
            Admin Register
          </button>
          <button
            className={mode.startsWith("employee") ? "active" : ""}
            type="button"
            onClick={() => {
              resetMessages();
              resetCamera();
              setMode("employee-code");
            }}
          >
            Employee Register
          </button>
        </div>

        <div className="section-header">
          <h2>{title}</h2>
          <p>Clean onboarding and access control designed for actual company operations.</p>
        </div>

        {!!authError && <div className="alert error">{authError}</div>}
        {!!error && <div className="alert error">{error}</div>}
        {!!message && <div className="alert success">{message}</div>}
        {!!successCode && (
          <div className="alert success">
            Your company code is <strong>{successCode}</strong>. Share it with your team for onboarding.
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
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Signing In..." : "Login"}
            </button>
            <div className="row-between">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  resetMessages();
                  setForgotPasswordEmail(loginForm.email);
                  setMode("forgot-password");
                }}
              >
                Forgot Password?
              </button>
              <button type="button" className="text-button" onClick={handleResendVerification} disabled={loading}>
                Resend Verification Email
              </button>
            </div>
          </form>
        )}

        {mode === "forgot-password" && (
          <form onSubmit={handleForgotPassword} className="stack">
            <label>
              Work Email
              <input
                type="email"
                value={forgotPasswordEmail}
                onChange={(event) => setForgotPasswordEmail(event.target.value)}
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Sending Reset Link..." : "Send Reset Link"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                resetMessages();
                setMode("login");
              }}
            >
              Back To Login
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
              Confirm New Password
              <input
                type="password"
                value={resetPasswordForm.confirmPassword}
                onChange={(event) =>
                  setResetPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                }
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Updating Password..." : "Update Password"}
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
                Business Registration Proof
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
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Creating Company..." : "Create Admin Account"}
            </button>
          </form>
        )}

        {mode === "employee-code" && (
          <form onSubmit={handleVerifyCompanyCode} className="stack">
            <label>
              10 Digit Company Code
              <input
                inputMode="numeric"
                minLength={10}
                maxLength={10}
                value={companyCodeInput}
                onChange={(event) => setCompanyCodeInput(event.target.value.replace(/\D/g, "").slice(0, 10))}
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Verify Company Code"}
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
              <div className="section-header">
                <h3>Live Profile Capture</h3>
                <p>Profile photos must come from your live camera. File uploads are not allowed.</p>
              </div>
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
                      Capture Profile Photo
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
  );
}
