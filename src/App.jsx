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

function BlockedScreen({ blockReason, onLogout }) {
  const blockedState = {
    suspended: {
      accent: "#dc2626",
      title: "Account Suspended",
      lines: [
        "Your account has been suspended due to a payment issue.",
        "Contact support@workpulse.com",
        "Your data is safe and will be restored upon payment.",
      ],
    },
    rejected: {
      accent: "#dc2626",
      title: "Registration Rejected",
      lines: [
        "Your company registration was not approved.",
        "Contact support@workpulse.com",
      ],
    },
    pending: {
      accent: "#d97706",
      title: "Pending Approval",
      lines: [
        "Your company is under review.",
        "We will notify you once approved.",
      ],
    },
  }[blockReason];

  if (!blockedState) return null;

  return (
    <div className="screen-centered">
      <div className="panel auth-panel access-state-panel">
        <span
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${blockedState.accent}18`,
            color: blockedState.accent,
            fontSize: 28,
            fontWeight: 700,
            margin: "0 auto 12px",
          }}
        >
          !
        </span>
        <div className="stack">
          <h1>{blockedState.title}</h1>
          {blockedState.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
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
  if (blockReason) return <BlockedScreen blockReason={blockReason} onLogout={onLogout} />;
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
        .select("*, companies(status, name)")
        .eq("id", currentSession.user.id)
        .single();

    if (profileError) {
      setAuthError(profileError.message);
      setProfile(null);
      setCompany(null);
      setLoading(false);
      return;
    }

    setProfile(userProfile);

    if (userProfile.role !== "admin" && !currentSession.user.email_confirmed_at) {
      await supabase.auth.signOut();
      setAuthError("Verify your email before accessing the dashboard.");
      setProfile(null);
      setCompany(null);
      setLoading(false);
      return;
    }

    const companyStatus = userProfile?.companies?.status;

    if (userProfile.role !== "super_admin") {
      if (companyStatus === "suspended") {
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
        setCompany({
          id: userProfile.company_id,
          status: companyStatus,
          name: userProfile?.companies?.name ?? "",
        });
        setBlockReason("pending");
        setLoading(false);
        return;
      }
    }

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
