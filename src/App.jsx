import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Auth from "./Auth";
import { WorkPulseLogo } from "./brand";
import Dashboard from "./Dashboard";
import LandingPage from "./LandingPage";
import { supabase } from "./supabase";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import Mail from "./pages/Mail";
import DailyReport from "./pages/DailyReport";
import SalarySlips from "./pages/SalarySlips";
import Profile from "./pages/Profile";
import ResetPassword from "./ResetPassword";
import Overview from "./pages/Overview";
import Employees from "./pages/Employees";
import LeaveApprovals from "./pages/LeaveApprovals";
import Broadcast from "./pages/Broadcast";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import RoleManagement from "./pages/RoleManagement";
import CompanySettings from "./pages/CompanySettings";
import SuperAdmin from "./pages/SuperAdmin";
import Assets from "./pages/Assets";
import Notifications from "./pages/Notifications";

function hasRecoveryTokens() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return hash.includes("type=recovery") || search.includes("type=recovery");
}

function LoadingScreen({ label }) {
  return (
    <div className="screen-centered">
      <div className="panel auth-panel">
        <WorkPulseLogo large subtitle="Workforce operations platform" />
        <p>{label}</p>
      </div>
    </div>
  );
}

function BlockedScreen({ reason, onLogout }) {
  const screens = {
    suspended: {
      icon: "🔒",
      title: "Account Suspended",
      message: "Your account has been suspended due to a payment issue.",
      sub: "Your data is safe and will be restored immediately upon payment.",
      contact: "Contact support@workpulse.com",
      color: "#f59e0b",
    },
    rejected: {
      icon: "❌",
      title: "Registration Rejected",
      message: "Your company registration was not approved.",
      sub: "Please contact us for more information.",
      contact: "Contact support@workpulse.com",
      color: "#ef4444",
    },
    pending: {
      icon: "⏳",
      title: "Pending Approval",
      message: "Your company is currently under review.",
      sub: "We will notify you once your account is approved. This usually takes 24 hours.",
      contact: "Contact support@workpulse.com",
      color: "#6366f1",
    },
  };

  const screen = screens[reason] || screens.pending;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8f7f4",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "48px 40px",
          background: "white",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          maxWidth: "440px",
          width: "100%",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>{screen.icon}</div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: screen.color,
            marginBottom: 12,
          }}
        >
          {screen.title}
        </h2>
        <p
          style={{
            color: "#374151",
            fontSize: 15,
            marginBottom: 8,
            lineHeight: 1.6,
          }}
        >
          {screen.message}
        </p>
        <p
          style={{
            color: "#6b7280",
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          {screen.sub}
        </p>
        <p
          style={{
            color: "#6366f1",
            fontSize: 13,
            marginBottom: 24,
          }}
        >
          {screen.contact}
        </p>
        <button type="button" className="primary-button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ session, profile, loading, blockReason, onLogout, children }) {
  if (loading) return <LoadingScreen label="Preparing your workspace..." />;
  if (!session) return <Navigate to="/login" replace />;
  if (blockReason) return <BlockedScreen reason={blockReason} onLogout={onLogout} />;
  if (!profile) return <LoadingScreen label="Loading your profile..." />;
  return children;
}

function getPostLoginRoute(profile) {
  if (profile?.role === "super_admin") return "/super-admin";
  if (profile?.role === "employee") return "/app/attendance";
  if (profile?.role === "admin" || profile?.role === "hr") return "/app/overview";
  return "/app";
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setCompany(null);
    setBlockReason("");
  };

  const loadProfile = async (currentSession) => {
    if (!currentSession?.user) {
      setProfile(null);
      setCompany(null);
      setAuthError("");
      setBlockReason("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setAuthError("");
    setBlockReason("");
    const { data: superAdminData } = await supabase
      .from("platform_super_admins")
      .select("*")
      .eq("id", currentSession.user.id)
      .maybeSingle();

    if (superAdminData) {
      setProfile({
        id: superAdminData.id,
        name: superAdminData.name,
        email: superAdminData.email,
        department: "Platform Operations",
        role: "super_admin",
      });
      setCompany(null);
      setLoading(false);
      return;
    }

    const { data: userProfile, error: profileError } = await supabase
      .from("users")
      .select("*, companies(id, name, status)")
      .eq("id", currentSession.user.id)
      .maybeSingle();

    if (profileError) {
      setAuthError(profileError.message);
      setProfile(null);
      setCompany(null);
      setLoading(false);
      return;
    }

    if (!userProfile) {
      await supabase.auth.signOut();
      setProfile(null);
      setCompany(null);
      setLoading(false);
      return;
    }

    if (userProfile.role === "super_admin") {
      setProfile(userProfile);
      setCompany(userProfile.companies ?? null);
      setLoading(false);
      return;
    }

    if (userProfile.role !== "admin" && !currentSession.user.email_confirmed_at) {
      await supabase.auth.signOut();
      setAuthError("Verify your email before accessing the dashboard.");
      setProfile(null);
      setCompany(null);
      setLoading(false);
      return;
    }

    const companyStatus = userProfile?.companies?.status;

    if (companyStatus === "suspended") {
      setProfile(null);
      setCompany({
        id: userProfile.company_id,
        status: companyStatus,
        name: userProfile?.companies?.name ?? "",
      });
      setBlockReason("suspended");
      setLoading(false);
      return;
    }
    if (companyStatus === "rejected") {
      setProfile(null);
      setCompany({
        id: userProfile.company_id,
        status: companyStatus,
        name: userProfile?.companies?.name ?? "",
      });
      setBlockReason("rejected");
      setLoading(false);
      return;
    }
    if (companyStatus === "pending") {
      setProfile(null);
      setCompany({
        id: userProfile.company_id,
        status: companyStatus,
        name: userProfile?.companies?.name ?? "",
      });
      setBlockReason("pending");
      setLoading(false);
      return;
    }

    setProfile(userProfile);

    if (userProfile.company_id) {
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("status, id, name, gst_number, phone, company_code, office_lat, office_lng, attendance_radius_meters, google_drive_folder_url, verification_status, verification_notes, verified_at, verified_by, created_at")
        .eq("id", userProfile.company_id)
        .single();

      if (companyError) {
        setAuthError(companyError.message);
        setCompany(null);
      } else {
        setCompany(companyData);
      }
    } else {
      setCompany(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    let isMounted = true;

    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(data.session ?? null);
      await loadProfile(data.session ?? null);
    };

    boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      loadProfile(nextSession ?? null);
    });

    const handleUnload = () => {
      supabase.auth.signOut();
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to={getPostLoginRoute(profile)} replace /> : <LandingPage />} />
      <Route
        path="/auth"
        element={
          session && !hasRecoveryTokens() ? (
            <Navigate to={getPostLoginRoute(profile)} replace />
          ) : (
            <Auth supabase={supabase} authError={authError} onRegistered={() => setAuthError("")} />
          )
        }
      />
      <Route
        path="/login"
        element={
          session && !hasRecoveryTokens() ? (
            <Navigate to={getPostLoginRoute(profile)} replace />
          ) : (
            <Auth supabase={supabase} authError={authError} onRegistered={() => setAuthError("")} />
          )
        }
      />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/super-admin"
        element={session ? <Navigate to="/app/super-admin" replace /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute
            session={session}
            profile={profile}
            loading={loading}
            blockReason={blockReason}
            onLogout={logout}
          >
            <Dashboard
              supabase={supabase}
              profile={profile}
              company={company}
              refreshProfile={() => loadProfile(session)}
              onLogout={logout}
            />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <Navigate
              to={
                profile?.role === "employee"
                  ? "attendance"
                  : profile?.role === "super_admin"
                    ? "super-admin"
                    : "overview"
              }
              replace
            />
          }
        />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leave" element={<Leave />} />
        <Route path="mail" element={<Mail />} />
        <Route path="daily-report" element={<DailyReport />} />
        <Route path="salary-slips" element={<SalarySlips />} />
        <Route path="profile" element={<Profile />} />
        <Route path="overview" element={<Overview />} />
        <Route path="employees" element={<Employees />} />
        <Route path="leave-approvals" element={<LeaveApprovals />} />
        <Route path="broadcast" element={<Broadcast />} />
        <Route path="reports" element={<Reports />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="role-management" element={<RoleManagement />} />
        <Route path="company-settings" element={<CompanySettings />} />
        <Route path="super-admin" element={<SuperAdmin />} />
        <Route path="assets" element={<Assets />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? getPostLoginRoute(profile) : "/"} replace />} />
    </Routes>
  );
}
