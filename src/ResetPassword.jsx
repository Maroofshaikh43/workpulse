import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

function hasRecoveryTokens() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return hash.includes("type=recovery") || search.includes("type=recovery");
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (hasRecoveryTokens()) {
      setReady(true);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (form.password.length < 6) {
      setError("Use a password with at least 6 characters.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: form.password,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Password updated! Redirecting to login...");
    window.setTimeout(() => {
      navigate("/login", { replace: true });
    }, 2000);
  };

  return (
    <div className="auth-route-shell">
      <header className="marketing-header auth-header">
        <Link to="/" className="public-brand">
          <span className="public-brand-mark">WP</span>
          <span className="public-brand-text">WorkPulse</span>
        </Link>
      </header>

      <div className="auth-center reset-center">
        <div className="auth-form-panel reset-panel">
          <div className="auth-minimal-card">
            <div className="auth-card-brand">
              <span className="public-brand-mark">WP</span>
              <strong>WorkPulse</strong>
            </div>

            <div className="section-header auth-card-header">
              <h1>Reset Password</h1>
              <p>Create a new password for your account.</p>
            </div>

            {!!error && <div className="alert error">{error}</div>}
            {!!message && <div className="alert success">{message}</div>}
            {!ready && !message ? (
              <div className="empty-state">
                Invalid or expired reset link. Please request a new password reset email.
              </div>
            ) : null}

            {ready ? (
              <form onSubmit={handleSubmit} className="stack">
                <label>
                  New Password
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Confirm Password
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    required
                  />
                </label>
                <button type="submit" className="primary-button full-width" disabled={loading}>
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
