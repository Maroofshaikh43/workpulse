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

function CompanyAccessScreen({ title, lines, onLogout }) {
  return (
    <div className="screen-centered">
      <div className="panel auth-panel access-state-panel">
        <WorkPulseLogo large subtitle="Workforce operations platform" />
        <div className="stack">
          <h1>{title}</h1>
          {lines.map((line) => (
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

function ProtectedRoute({ session, profile, company, loading, onLogout, children }) {
  if (loading) return <LoadingScreen label="Preparing your workspace..." />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <LoadingScreen label="Loading your profile..." />;
  if (profile.role !== "super_admin" && company?.status === "suspended") {
    return (
      <CompanyAccessScreen
        title="Account Suspended"
        lines={[
          "Your company account has been suspended due to a payment issue.",
          "Please contact support@workpulse.com",
          "Your data is safe and will be restored immediately upon payment.",
        ]}
        onLogout={onLogout}
      />
    );
  }
  if (profile.role !== "super_admin" && company?.status === "pending") {
    return (
      <CompanyAccessScreen
        title="Account Pending Verification"
        lines={[
          "Your company is under review.",
          "We will notify you once approved.",
        ]}
        onLogout={onLogout}
      />
    );
  }
  if (profile.role !== "super_admin" && company?.status === "rejected") {
    return (
      <CompanyAccessScreen
        title="Account Not Approved"
        lines={[
          "Your company registration was not approved.",
          "Please contact support@workpulse.com for help.",
        ]}
        onLogout={onLogout}
      />
    );
  }
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

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setCompany(null);
  };

  const loadProfile = async (currentSession) => {
    if (!currentSession?.user) {
      setProfile(null);
      setCompany(null);
      setLoading(false);
      return;
    }

    setLoading(true);
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

    const { data, error } = await supabase.from("users").select("*").eq("id", currentSession.user.id).single();
    if (error) {
      setAuthError(error.message);
      setProfile(null);
      setCompany(null);
      setLoading(false);
      return;
    }

    setProfile(data);

    if (data.role !== "admin" && !currentSession.user.email_confirmed_at) {
      await supabase.auth.signOut();
      setAuthError("Verify your email before accessing the dashboard.");
      setProfile(null);
      setCompany(null);
      setLoading(false);
      return;
    }

    if (data?.company_id) {
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("*")
        .eq("id", data.company_id)
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
            company={company}
            loading={loading}
            onLogout={logout}
          >
            <Dashboard
              supabase={supabase}
              profile={profile}
              company={company}
              refreshProfile={() => loadProfile(session)}
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
