import { useEffect, useMemo, useRef, useState } from "react";
import { askAI } from "../utils/ai";
import { formatDate, formatTime, getDateOffset, getToday } from "../utils";

const employeeSuggestions = [
  "My attendance this month",
  "How many leaves do I have?",
  "Help me write a leave request",
];

const adminSuggestions = [
  "Who is absent today?",
  "Show pending leave requests",
  "Review Rahul's attendance this month",
  "Summarize today's company status",
];

function createMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function formatMessageTimestamp(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWelcomeMessage(role) {
  if (role === "employee") {
    return "Hi, I'm WorkPulse AI. I can help with your attendance, leave balance, leave requests, and HR questions.";
  }

  return "Hi, I'm WorkPulse AI. I can help with company attendance, employee status, leave reviews, reports, and employee-specific questions.";
}

async function loadEmployeeContext(supabase, profile) {
  const today = getToday();
  const firstDayOfMonth = `${today.slice(0, 8)}01`;

  const [leavesResponse, attendanceResponse] = await Promise.all([
    supabase.from("leaves").select("days,status,type,from_date,to_date,reason").eq("user_id", profile.id),
    supabase
      .from("attendance")
      .select("status,check_in_time,check_out_time")
      .eq("user_id", profile.id)
      .eq("date", today)
      .maybeSingle(),
  ]);

  if (leavesResponse.error) throw leavesResponse.error;
  if (attendanceResponse.error) throw attendanceResponse.error;

  const monthAttendanceResponse = await supabase
    .from("attendance")
    .select("date,status,check_in_time,check_out_time")
    .eq("user_id", profile.id)
    .gte("date", firstDayOfMonth)
    .lte("date", today)
    .order("date", { ascending: false });

  if (monthAttendanceResponse.error) throw monthAttendanceResponse.error;

  const leaves = leavesResponse.data ?? [];
  const used = leaves.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.days, 0);
  const pending = leaves.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.days, 0);
  const attendance = attendanceResponse.data ?? null;

  return {
    scope: "employee",
    permissions: "Only answer for this employee's own data. Do not provide company-wide employee data.",
    name: profile.name,
    department: profile.department,
    role: profile.role,
    leaveBalance: {
      available: Math.max(0, 24 - used),
      used,
      pending,
    },
    todayAttendanceStatus: attendance?.status ?? "absent",
    todayCheckInTime: attendance?.check_in_time ? formatTime(attendance.check_in_time) : null,
    todayCheckOutTime: attendance?.check_out_time ? formatTime(attendance.check_out_time) : null,
    thisMonthAttendanceSummary: {
      present: (monthAttendanceResponse.data ?? []).filter((item) => item.status === "present").length,
      late: (monthAttendanceResponse.data ?? []).filter((item) => item.status === "late").length,
      totalMarkedDays: (monthAttendanceResponse.data ?? []).length,
    },
    recentLeaveRequests: leaves.slice(0, 5).map((item) => ({
      type: item.type,
      status: item.status,
      fromDate: item.from_date,
      toDate: item.to_date,
      reason: item.reason,
      days: item.days,
    })),
  };
}

async function loadAdminContext(supabase, profile, company) {
  const today = getToday();
  const monthStart = `${today.slice(0, 8)}01`;
  const weekStart = getDateOffset(-6);

  const [usersResponse, attendanceResponse, monthAttendanceResponse, leavesResponse, reportsResponse] = await Promise.all([
    supabase
      .from("users")
      .select("id,name,email,department,role,is_active,created_at")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("attendance")
      .select("user_id,status,check_in_time,check_out_time,date")
      .eq("company_id", profile.company_id)
      .eq("date", today),
    supabase
      .from("attendance")
      .select("user_id,status,check_in_time,check_out_time,date")
      .eq("company_id", profile.company_id)
      .gte("date", monthStart)
      .lte("date", today),
    supabase
      .from("leaves")
      .select("id,user_id,type,status,days,from_date,to_date,reason,created_at")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("daily_reports")
      .select("user_id,date,hours,mood,tasks")
      .eq("company_id", profile.company_id)
      .gte("date", weekStart)
      .order("date", { ascending: false }),
  ]);

  if (usersResponse.error) throw usersResponse.error;
  if (attendanceResponse.error) throw attendanceResponse.error;
  if (monthAttendanceResponse.error) throw monthAttendanceResponse.error;
  if (leavesResponse.error) throw leavesResponse.error;
  if (reportsResponse.error) throw reportsResponse.error;

  const employees = usersResponse.data ?? [];
  const todayAttendance = attendanceResponse.data ?? [];
  const monthAttendance = monthAttendanceResponse.data ?? [];
  const leaves = leavesResponse.data ?? [];
  const reports = reportsResponse.data ?? [];
  const presentToday = todayAttendance.filter((item) => ["present", "late"].includes(item.status)).length;
  const employeeMap = employees.reduce((accumulator, employee) => {
    accumulator[employee.id] = employee;
    return accumulator;
  }, {});

  const employeeSnapshots = employees.slice(0, 25).map((employee) => {
    const todayRecord = todayAttendance.find((item) => item.user_id === employee.id);
    const employeeMonthAttendance = monthAttendance.filter((item) => item.user_id === employee.id);
    const employeeLeaves = leaves.filter((item) => item.user_id === employee.id);
    const employeeReports = reports.filter((item) => item.user_id === employee.id);

    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      department: employee.department,
      role: employee.role,
      isActive: employee.is_active,
      todayStatus: todayRecord?.status ?? "absent",
      todayCheckIn: todayRecord?.check_in_time ? formatTime(todayRecord.check_in_time) : null,
      todayCheckOut: todayRecord?.check_out_time ? formatTime(todayRecord.check_out_time) : null,
      monthAttendance: {
        present: employeeMonthAttendance.filter((item) => item.status === "present").length,
        late: employeeMonthAttendance.filter((item) => item.status === "late").length,
        markedDays: employeeMonthAttendance.length,
      },
      leaveSummary: {
        pending: employeeLeaves.filter((item) => item.status === "pending").length,
        approvedDays: employeeLeaves.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.days, 0),
      },
      recentReports: employeeReports.slice(0, 3).map((item) => ({
        date: formatDate(item.date),
        hours: item.hours,
        mood: item.mood,
      })),
    };
  });

  return {
    scope: profile.role,
    permissions: "Admin and HR can ask about company-level data and specific employees in this company.",
    companyName: company?.name ?? "WorkPulse",
    totalEmployeesCount: employees.filter((employee) => employee.is_active).length,
    presentTodayCount: presentToday,
    absentTodayCount: Math.max(0, employees.filter((employee) => employee.is_active).length - presentToday),
    pendingLeavesCount: leaves.filter((item) => item.status === "pending").length,
    employees: employeeSnapshots,
    pendingLeaves: leaves
      .filter((item) => item.status === "pending")
      .slice(0, 15)
      .map((item) => ({
        employeeName: employeeMap[item.user_id]?.name ?? item.user_id,
        department: employeeMap[item.user_id]?.department ?? "",
        type: item.type,
        days: item.days,
        fromDate: item.from_date,
        toDate: item.to_date,
        reason: item.reason,
      })),
    todayAttendanceBoard: todayAttendance.slice(0, 25).map((item) => ({
      employeeName: employeeMap[item.user_id]?.name ?? item.user_id,
      department: employeeMap[item.user_id]?.department ?? "",
      status: item.status,
      checkIn: item.check_in_time ? formatTime(item.check_in_time) : null,
      checkOut: item.check_out_time ? formatTime(item.check_out_time) : null,
    })),
    recentDailyReports: reports.slice(0, 20).map((item) => ({
      employeeName: employeeMap[item.user_id]?.name ?? item.user_id,
      department: employeeMap[item.user_id]?.department ?? "",
      date: item.date,
      hours: item.hours,
      mood: item.mood,
      tasks: item.tasks,
    })),
  };
}

export default function AIAssistant({ supabase, profile, company }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [aiContext, setAiContext] = useState(null);
  const [messages, setMessages] = useState(() => [createMessage("assistant", buildWelcomeMessage(profile.role))]);
  const messagesRef = useRef(null);

  const isEmployee = profile.role === "employee";
  const quickSuggestions = isEmployee ? employeeSuggestions : adminSuggestions;
  const canChat = useMemo(() => !loading && !contextLoading, [contextLoading, loading]);

  useEffect(() => {
    setMessages([createMessage("assistant", buildWelcomeMessage(profile.role))]);
  }, [profile.role]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const fetchContext = async () => {
      setContextLoading(true);
      setContextError("");

      try {
        const context =
          profile.role === "employee"
            ? await loadEmployeeContext(supabase, profile)
            : await loadAdminContext(supabase, profile, company);

        if (!cancelled) {
          setAiContext(context);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load AI context:", error);
          setAiContext(null);
          setContextError("Unable to load live HR context right now.");
        }
      } finally {
        if (!cancelled) {
          setContextLoading(false);
        }
      }
    };

    fetchContext();

    return () => {
      cancelled = true;
    };
  }, [company, isOpen, profile, supabase]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [contextLoading, loading, messages, isOpen]);

  const submitPrompt = async (promptText) => {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt || !canChat) return;

    const userMessage = createMessage("user", trimmedPrompt);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    const reply = await askAI(trimmedPrompt, {
      companyStatus: company?.status ?? "unknown",
      userRole: profile.role,
      ...aiContext,
    });

    setMessages((current) => [...current, createMessage("assistant", reply)]);
    setLoading(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitPrompt(input);
  };

  const handleSuggestionClick = async (suggestion) => {
    await submitPrompt(suggestion);
  };

  return (
    <div className="ai-assistant-shell">
      {isOpen ? (
        <section className="ai-assistant-panel" aria-label="WorkPulse AI assistant">
          <header className="ai-assistant-header">
            <div>
              <strong>WorkPulse AI</strong>
              <span>{isEmployee ? "Employee Assistant" : "Admin Assistant"}</span>
            </div>
            <button
              type="button"
              className="icon-button ai-assistant-close"
              aria-label="Close AI assistant"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="ai-assistant-messages" ref={messagesRef}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`ai-message-row ${message.role === "user" ? "user" : "assistant"}`}
              >
                <div className={`ai-message-bubble ${message.role === "user" ? "user" : "assistant"}`}>
                  <p>{message.content}</p>
                </div>
                <span className="ai-message-time">{formatMessageTimestamp(message.createdAt)}</span>
              </div>
            ))}

            {contextError ? <div className="ai-assistant-inline-error">{contextError}</div> : null}
            {contextLoading ? <div className="ai-thinking">Loading assistant context...</div> : null}
            {loading ? <div className="ai-thinking">AI is thinking...</div> : null}
          </div>

          <div className="ai-assistant-input-wrap">
            <div className="ai-suggestion-list">
              {quickSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="ai-suggestion-chip"
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={!canChat}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <form className="ai-assistant-form" onSubmit={handleSubmit}>
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={isEmployee ? "Ask about your work data..." : "Ask about company or employee data..."}
                disabled={!canChat}
              />
              <button type="submit" className="primary-button ai-send-button" disabled={!canChat || !input.trim()}>
                Send
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="ai-assistant-launcher"
        aria-label="Open WorkPulse AI"
        onClick={() => setIsOpen(true)}
      >
        <span aria-hidden="true">🤖</span>
      </button>
    </div>
  );
}
