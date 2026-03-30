import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Auth from "./Auth";
import Dashboard from "./Dashboard";
import { supabase } from "./supabase";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import Mail from "./pages/Mail";
import DailyReport from "./pages/DailyReport";
import SalarySlips from "./pages/SalarySlips";
import Profile from "./pages/Profile";
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
        <h1>WorkPulse</h1>
        <p>{label}</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ session, profile, loading, children }) {
  if (loading) return <LoadingScreen label="Preparing your workspace..." />;
  if (!session) return <Navigate to="/auth" replace />;
  if (!profile) return <LoadingScreen label="Loading your profile..." />;
  return children;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

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
      <Route
        path="/auth"
        element={
          session && !hasRecoveryTokens() ? (
            <Navigate to="/app" replace />
          ) : (
            <Auth supabase={supabase} authError={authError} onRegistered={() => setAuthError("")} />
          )
        }
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute session={session} profile={profile} loading={loading}>
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
      <Route path="*" element={<Navigate to={session ? "/app" : "/auth"} replace />} />
    </Routes>
  );
}
