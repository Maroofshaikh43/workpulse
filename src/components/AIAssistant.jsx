import { useEffect, useMemo, useRef, useState } from "react";
import { askAI } from "../utils/ai";
import { formatTime, getToday } from "../utils";

const quickSuggestions = [
  "My attendance this month",
  "How many leaves do I have?",
  "Help me write a leave request",
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

async function loadEmployeeContext(supabase, profile) {
  const today = getToday();
  const firstDayOfMonth = `${today.slice(0, 8)}01`;

  const [leavesResponse, attendanceResponse] = await Promise.all([
    supabase.from("leaves").select("days,status").eq("user_id", profile.id),
    supabase.from("attendance").select("status,check_in_time,check_out_time").eq("user_id", profile.id).eq("date", today).maybeSingle(),
  ]);

  if (leavesResponse.error) throw leavesResponse.error;
  if (attendanceResponse.error) throw attendanceResponse.error;

  const monthAttendanceResponse = await supabase
    .from("attendance")
    .select("date,status")
    .eq("user_id", profile.id)
    .gte("date", firstDayOfMonth)
    .lte("date", today);

  if (monthAttendanceResponse.error) throw monthAttendanceResponse.error;

  const leaves = leavesResponse.data ?? [];
  const used = leaves.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.days, 0);
  const pending = leaves.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.days, 0);
  const attendance = attendanceResponse.data ?? null;

  return {
    scope: "employee",
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
  };
}

async function loadAdminContext(supabase, profile, company) {
  const today = getToday();
  const [usersResponse, attendanceResponse, leavesResponse] = await Promise.all([
    supabase.from("users").select("id").eq("company_id", profile.company_id).eq("is_active", true),
    supabase.from("attendance").select("user_id,status").eq("company_id", profile.company_id).eq("date", today),
    supabase.from("leaves").select("id").eq("company_id", profile.company_id).eq("status", "pending"),
  ]);

  if (usersResponse.error) throw usersResponse.error;
  if (attendanceResponse.error) throw attendanceResponse.error;
  if (leavesResponse.error) throw leavesResponse.error;

  const employees = usersResponse.data ?? [];
  const todayAttendance = attendanceResponse.data ?? [];
  const presentToday = todayAttendance.filter((item) => ["present", "late"].includes(item.status)).length;

  return {
    scope: profile.role,
    companyName: company?.name ?? "WorkPulse",
    totalEmployeesCount: employees.length,
    presentTodayCount: presentToday,
    absentTodayCount: Math.max(0, employees.length - presentToday),
    pendingLeavesCount: (leavesResponse.data ?? []).length,
  };
}

export default function AIAssistant({ supabase, profile, company }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [aiContext, setAiContext] = useState(null);
  const [messages, setMessages] = useState(() => [
    createMessage("assistant", "Hi, I’m WorkPulse AI. Ask me about attendance, leave balance, reports, or HR help."),
  ]);
  const messagesRef = useRef(null);

  const canChat = useMemo(() => !loading && !contextLoading, [contextLoading, loading]);

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
              <span>Powered by DeepSeek</span>
            </div>
            <button type="button" className="icon-button ai-assistant-close" aria-label="Close AI assistant" onClick={() => setIsOpen(false)}>
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
                placeholder="Ask WorkPulse AI..."
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
