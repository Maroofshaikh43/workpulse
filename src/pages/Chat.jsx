import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Icon } from "../brand";
import { formatTime, getToday } from "../utils";

const DEFAULT_CHANNELS = [
  { name: "general", description: "Company wide conversations" },
  { name: "announcements", description: "Important updates" },
  { name: "hr", description: "HR updates and policies" },
  { name: "dispatch", description: "Operations and dispatch coordination" },
  { name: "random", description: "Fun and casual" },
];

const EMOJI_OPTIONS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F389}"];
const ICON_ITEMS = [
  { id: "chats", icon: "\u{1F4AC}", label: "Chats" },
  { id: "channels", icon: "#", label: "Channels" },
  { id: "history", icon: "\u{1F550}", label: "History" },
  { id: "files", icon: "\u{1F4C1}", label: "Files" },
  { id: "tasks", icon: "\u2705", label: "Tasks" },
  { id: "org", icon: "\u{1F3E2}", label: "Org chart" },
  { id: "calendar", icon: "\u{1F4C5}", label: "Calendar" },
  { id: "notes", icon: "\u{1F4DD}", label: "Notes" },
];
const GROUP_GAP_MS = 5 * 60 * 1000;
const TYPING_VISIBLE_MS = 3000;
const TYPING_THROTTLE_MS = 2000;

function getInitials(name) {
  if (!name) return "U";
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getAvatarColor(seed = "") {
  const palette = ["#7c3aed", "#2563eb", "#059669", "#f97316", "#dc2626", "#0891b2"];
  const value = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[value % palette.length];
}

function createDmName(leftId, rightId) {
  return `dm-${[leftId, rightId].sort().join("-")}`;
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, query) {
  if (!query.trim()) return text;
  const matcher = new RegExp(`(${escapeForRegex(query)})`, "ig");
  return text.split(matcher).map((part, index) =>
    matcher.test(part) ? (
      <mark key={`${part}-${index}`} className="cliq-highlight">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function isImage(fileType = "", fileUrl = "") {
  return fileType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileUrl);
}

function getDayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function sameGroup(prev, next) {
  if (!prev) return false;
  return (
    prev.sender_id === next.sender_id &&
    new Date(prev.created_at).toDateString() === new Date(next.created_at).toDateString() &&
    new Date(next.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS
  );
}

function sortByDate(rows) {
  return [...rows].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
}

function buildUnread(messages, memberships, userId) {
  const lastReadMap = memberships.reduce((acc, item) => {
    acc[item.channel_id] = item.last_read_at ? new Date(item.last_read_at).getTime() : 0;
    return acc;
  }, {});

  return messages.reduce((acc, item) => {
    const createdAt = item.created_at ? new Date(item.created_at).getTime() : 0;
    const lastReadAt = lastReadMap[item.channel_id] ?? 0;
    if (item.sender_id !== userId && createdAt > lastReadAt) {
      acc[item.channel_id] = (acc[item.channel_id] ?? 0) + 1;
    }
    return acc;
  }, {});
}

function getFileCategory(message) {
  if (isImage(message.file_type ?? "", message.file_url ?? "")) return "Images";
  if ((message.file_type ?? "").startsWith("video/")) return "Videos";
  return "Documents";
}

function scrollToBottom(ref) {
  window.requestAnimationFrame(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  });
}

function upsertRow(rows, nextRow) {
  return sortByDate([...rows.filter((item) => item.id !== nextRow.id), nextRow]);
}

export default function Chat() {
  const navigate = useNavigate();
  const { supabase, profile, refreshChatUnreadCount } = useOutletContext();
  const canManageChannels = profile.role === "admin" || profile.role === "hr";
  const today = getToday();

  const [activeSection, setActiveSection] = useState("chats");
  const [channels, setChannels] = useState([]);
  const [channelMembers, setChannelMembers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [workspaceMessages, setWorkspaceMessages] = useState([]);
  const [channelMessages, setChannelMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [leaveRows, setLeaveRows] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [threadMessageId, setThreadMessageId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [threadText, setThreadText] = useState("");
  const [mainAttachment, setMainAttachment] = useState(null);
  const [threadAttachment, setThreadAttachment] = useState(null);
  const [channelQuery, setChannelQuery] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [searchOverlayQuery, setSearchOverlayQuery] = useState("");
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", type: "public", members: [] });
  const [hoveredMessageId, setHoveredMessageId] = useState("");
  const [reactionTargetId, setReactionTargetId] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [presenceMap, setPresenceMap] = useState({});
  const [statusOverride, setStatusOverride] = useState("");
  const [remoteWork, setRemoteWork] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const listRef = useRef(null);
  const threadRef = useRef(null);
  const fileInputRef = useRef(null);
  const threadFileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const messagesRef = useRef([]);
  const channelsRef = useRef([]);
  const channelMembersRef = useRef([]);
  const typingChannelRef = useRef(null);
  const typingTimeoutsRef = useRef({});
  const typingSentAtRef = useRef(0);

  const employeesById = useMemo(() => employees.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {}), [employees]);

  const membersByChannel = useMemo(() => channelMembers.reduce((acc, item) => {
    if (!acc[item.channel_id]) acc[item.channel_id] = [];
    acc[item.channel_id].push(item);
    return acc;
  }, {}), [channelMembers]);

  const attendanceByUser = useMemo(() => attendanceRows.reduce((acc, item) => {
    acc[item.user_id] = item;
    return acc;
  }, {}), [attendanceRows]);

  const onLeaveIds = useMemo(() => new Set(leaveRows.map((item) => item.user_id)), [leaveRows]);

  const channelsWithMeta = useMemo(() => channels.map((channel) => {
    const members = membersByChannel[channel.id] ?? [];
    const partner = channel.type === "direct"
      ? members.map((item) => employeesById[item.user_id]).find((item) => item && item.id !== profile.id) ?? null
      : null;
    return {
      ...channel,
      members,
      memberCount: members.length,
      partner,
      displayName: channel.type === "direct" ? partner?.name ?? "Direct Message" : channel.name,
    };
  }), [channels, employeesById, membersByChannel, profile.id]);

  const selectedChannel = useMemo(() => channelsWithMeta.find((item) => item.id === selectedChannelId) ?? null, [channelsWithMeta, selectedChannelId]);
  const topLevelMessages = useMemo(() => sortByDate(channelMessages.filter((item) => !item.reply_to)), [channelMessages]);
  const threadParent = useMemo(() => channelMessages.find((item) => item.id === threadMessageId) ?? null, [channelMessages, threadMessageId]);
  const threadReplies = useMemo(() => sortByDate(channelMessages.filter((item) => item.reply_to === threadMessageId)), [channelMessages, threadMessageId]);

  const visibleMessages = useMemo(() => {
    if (!messageQuery.trim()) return topLevelMessages;
    const query = messageQuery.trim().toLowerCase();
    return topLevelMessages.filter((item) =>
      (item.content ?? "").toLowerCase().includes(query) ||
      (item.sender?.name ?? "").toLowerCase().includes(query) ||
      channelMessages.some((reply) => reply.reply_to === item.id && (reply.content ?? "").toLowerCase().includes(query))
    );
  }, [channelMessages, messageQuery, topLevelMessages]);

  const reactionMap = useMemo(() => reactions.reduce((acc, item) => {
    if (!acc[item.message_id]) acc[item.message_id] = [];
    acc[item.message_id].push(item);
    return acc;
  }, {}), [reactions]);

  const unreadByChannel = useMemo(
    () => buildUnread(workspaceMessages, channelMembers.filter((item) => item.user_id === profile.id), profile.id),
    [channelMembers, profile.id, workspaceMessages],
  );

  const filteredChannels = useMemo(() => {
    const query = channelQuery.trim().toLowerCase();
    return channelsWithMeta.filter((item) => item.type !== "direct" && (!query || `${item.name} ${item.description ?? ""}`.toLowerCase().includes(query)));
  }, [channelQuery, channelsWithMeta]);

  const listedChannels = useMemo(() => (showAllChannels ? filteredChannels : filteredChannels.slice(0, 5)), [filteredChannels, showAllChannels]);
  const directMessages = useMemo(() => employees.filter((item) => item.id !== profile.id && (!channelQuery.trim() || `${item.name} ${item.email} ${item.department ?? ""}`.toLowerCase().includes(channelQuery.trim().toLowerCase()))), [channelQuery, employees, profile.id]);
  const fileMessages = useMemo(() => sortByDate(workspaceMessages.filter((item) => item.file_url)), [workspaceMessages]);
  const groupedFiles = useMemo(() => fileMessages.reduce((acc, item) => {
    const category = getFileCategory(item);
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {}), [fileMessages]);

  const firstUnreadMessageId = useMemo(() => {
    const membership = channelMembers.find((item) => item.channel_id === selectedChannelId && item.user_id === profile.id);
    const lastReadAt = membership?.last_read_at ? new Date(membership.last_read_at).getTime() : 0;
    return visibleMessages.find((item) => item.sender_id !== profile.id && new Date(item.created_at).getTime() > lastReadAt)?.id;
  }, [channelMembers, profile.id, selectedChannelId, visibleMessages]);

  const currentAttendance = attendanceByUser[profile.id] ?? null;
  const isCheckedIn = !!currentAttendance?.check_in_time && !currentAttendance?.check_out_time;
  const currentStatus = statusOverride || (onLeaveIds.has(profile.id) ? "out_of_office" : isCheckedIn ? "at_work" : "away");

  const peopleStatus = useMemo(() => employees.map((employee) => {
    const attendance = attendanceByUser[employee.id];
    const presence = presenceMap[employee.id]?.chat_status;
    const status = employee.id === profile.id
      ? currentStatus
      : onLeaveIds.has(employee.id)
        ? "out_of_office"
        : presence || (attendance?.check_in_time && !attendance?.check_out_time ? "at_work" : "away");
    return { employee, status };
  }), [attendanceByUser, currentStatus, employees, onLeaveIds, presenceMap, profile.id]);

  const atWorkPeople = useMemo(() => peopleStatus.filter((item) => item.status === "at_work"), [peopleStatus]);
  const awayPeople = useMemo(() => peopleStatus.filter((item) => item.status !== "at_work"), [peopleStatus]);
  const searchResults = useMemo(() => {
    const query = searchOverlayQuery.trim().toLowerCase();
    if (!query) return { channels: [], people: [], messages: [], files: [] };
    return {
      channels: channelsWithMeta.filter((item) => item.displayName.toLowerCase().includes(query)).slice(0, 8),
      people: employees.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(query)).slice(0, 8),
      messages: workspaceMessages.filter((item) => (item.content ?? "").toLowerCase().includes(query)).slice(0, 10),
      files: fileMessages.filter((item) => (item.file_url ?? "").toLowerCase().includes(query)).slice(0, 8),
    };
  }, [channelsWithMeta, employees, fileMessages, searchOverlayQuery, workspaceMessages]);

  const fetchEmployees = async () => {
    const { data, error: fetchError } = await supabase.from("users").select("id, name, email, department, role, profile_photo_url").eq("company_id", profile.company_id).order("name");
    if (fetchError) throw fetchError;
    setEmployees(data ?? []);
    return data ?? [];
  };

  const createDefaultChannels = async () => {
    const { data: users, error: usersError } = await supabase.from("users").select("id").eq("company_id", profile.company_id);
    if (usersError) throw usersError;
    for (const channel of DEFAULT_CHANNELS) {
      const { data: created, error: createError } = await supabase.from("channels").insert({ company_id: profile.company_id, name: channel.name, description: channel.description, type: "public", created_by: profile.id }).select("*").single();
      if (createError && createError.code !== "23505") throw createError;
      if (created) {
        const { error: memberError } = await supabase.from("channel_members").insert((users ?? []).map((user) => ({ channel_id: created.id, user_id: user.id })));
        if (memberError && memberError.code !== "23505") throw memberError;
      }
    }
  };

  const fetchChannels = async () => {
    const { data, error: fetchError } = await supabase.from("channels").select("*, channel_members!inner(user_id)").eq("company_id", profile.company_id).eq("channel_members.user_id", profile.id).order("name");
    if (fetchError) throw fetchError;
    let nextRows = data ?? [];
    if (!nextRows.length) {
      await createDefaultChannels();
      const retry = await supabase.from("channels").select("*, channel_members!inner(user_id)").eq("company_id", profile.company_id).eq("channel_members.user_id", profile.id).order("name");
      if (retry.error) throw retry.error;
      nextRows = retry.data ?? [];
    }
    const cleaned = nextRows.map(({ channel_members: ignored, ...rest }) => rest);
    setChannels(cleaned);
    return cleaned;
  };

  const fetchChannelMembers = async (channelRows) => {
    if (!channelRows.length) {
      setChannelMembers([]);
      return [];
    }
    const { data, error: fetchError } = await supabase.from("channel_members").select("id, channel_id, user_id, last_read_at, created_at").in("channel_id", channelRows.map((item) => item.id));
    if (fetchError) throw fetchError;
    setChannelMembers(data ?? []);
    return data ?? [];
  };

  const fetchAttendanceHub = async () => {
    const [attendanceResponse, leaveResponse] = await Promise.all([
      supabase.from("attendance").select("*").eq("company_id", profile.company_id).eq("date", today),
      supabase.from("leaves").select("user_id, from_date, to_date, status").eq("company_id", profile.company_id).eq("status", "approved").lte("from_date", today).gte("to_date", today),
    ]);
    if (attendanceResponse.error || leaveResponse.error) throw attendanceResponse.error || leaveResponse.error;
    setAttendanceRows(attendanceResponse.data ?? []);
    setLeaveRows(leaveResponse.data ?? []);
  };

  const fetchWorkspaceMessages = async (channelRows) => {
    if (!channelRows.length) {
      setWorkspaceMessages([]);
      return [];
    }
    const { data, error: fetchError } = await supabase.from("messages").select("id, channel_id, sender_id, content, file_url, file_type, reply_to, edited_at, created_at, sender:users!messages_sender_id_fkey(id, name, email, department, profile_photo_url)").in("channel_id", channelRows.map((item) => item.id)).order("created_at", { ascending: true });
    if (fetchError) throw fetchError;
    setWorkspaceMessages(data ?? []);
    refreshChatUnreadCount?.();
    return data ?? [];
  };

  const fetchMessages = async (channelId) => {
    if (!channelId) {
      setChannelMessages([]);
      setReactions([]);
      return;
    }
    setLoadingMessages(true);
    const { data, error: fetchError } = await supabase.from("messages").select("id, channel_id, sender_id, content, file_url, file_type, reply_to, edited_at, created_at, sender:users!messages_sender_id_fkey(id, name, email, department, profile_photo_url)").eq("channel_id", channelId).order("created_at", { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
      setLoadingMessages(false);
      return;
    }
    const nextRows = data ?? [];
    setChannelMessages(nextRows);
    const ids = nextRows.map((item) => item.id);
    if (ids.length) {
      const reactionsResponse = await supabase.from("message_reactions").select("*").in("message_id", ids);
      if (!reactionsResponse.error) setReactions(reactionsResponse.data ?? []);
    } else {
      setReactions([]);
    }
    setLoadingMessages(false);
    scrollToBottom(listRef);
  };

  const fetchFullMessage = async (messageId) => {
    const { data, error: fetchError } = await supabase.from("messages").select("id, channel_id, sender_id, content, file_url, file_type, reply_to, edited_at, created_at, sender:users!messages_sender_id_fkey(id, name, email, department, profile_photo_url)").eq("id", messageId).single();
    if (fetchError) return null;
    return data;
  };

  const markChannelRead = async (channelId) => {
    if (!channelId) return;
    const timestamp = new Date().toISOString();
    await supabase.from("channel_members").update({ last_read_at: timestamp }).eq("channel_id", channelId).eq("user_id", profile.id);
    setChannelMembers((current) => current.map((item) => item.channel_id === channelId && item.user_id === profile.id ? { ...item, last_read_at: timestamp } : item));
    refreshChatUnreadCount?.();
  };

  const uploadAttachment = async (file) => {
    if (!file) return { fileUrl: null, fileType: null };
    const path = `${profile.company_id}/${selectedChannelId || "global"}/${profile.id}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { error: uploadError } = await supabase.storage.from("chat-files").upload(path, file, { cacheControl: "3600", upsert: false });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("chat-files").getPublicUrl(path);
    return { fileUrl: data.publicUrl, fileType: file.type || null };
  };
  const sendMessage = async ({ text, attachment, replyTo = null, clear }) => {
    if (!selectedChannel) return;
    const content = text.trim();
    if (!content && !attachment?.file) return;
    setSending(true);
    clear();
    try {
      const upload = await uploadAttachment(attachment?.file ?? null);
      const { error: insertError } = await supabase.from("messages").insert({
        channel_id: selectedChannel.id,
        company_id: profile.company_id,
        sender_id: profile.id,
        content: content || null,
        file_url: upload.fileUrl,
        file_type: upload.fileType,
        reply_to: replyTo,
      });
      if (insertError) throw insertError;
      await markChannelRead(selectedChannel.id);
    } catch (sendError) {
      setError(sendError.message);
      if (replyTo) {
        setThreadText(text);
        setThreadAttachment(attachment ?? null);
      } else {
        setMessageText(text);
        setMainAttachment(attachment ?? null);
      }
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = async (messageId, emoji) => {
    const existing = reactions.find((item) => item.message_id === messageId && item.user_id === profile.id && item.emoji === emoji);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: messageId, user_id: profile.id, emoji });
    }
  };

  const openDm = async (otherUser) => {
    const existing = channels.find((item) => item.type === "direct" && item.name.includes(profile.id) && item.name.includes(otherUser.id));
    if (existing) {
      setActiveSection("chats");
      setSelectedChannelId(existing.id);
      return;
    }
    const { data: channel, error: channelError } = await supabase.from("channels").insert({ company_id: profile.company_id, name: createDmName(profile.id, otherUser.id), type: "direct", created_by: profile.id }).select("*").single();
    if (channelError) {
      setError(channelError.message);
      return;
    }
    const { error: memberError } = await supabase.from("channel_members").insert([
      { channel_id: channel.id, user_id: profile.id },
      { channel_id: channel.id, user_id: otherUser.id },
    ]);
    if (memberError) {
      setError(memberError.message);
      return;
    }
    const nextChannels = await fetchChannels();
    await fetchChannelMembers(nextChannels);
    await fetchWorkspaceMessages(nextChannels);
    setActiveSection("chats");
    setSelectedChannelId(channel.id);
  };

  const createChannel = async () => {
    const name = createForm.name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) {
      setError("Channel name is required.");
      return;
    }
    const { data: channel, error: channelError } = await supabase.from("channels").insert({
      company_id: profile.company_id,
      name,
      description: createForm.description.trim() || null,
      type: createForm.type,
      created_by: profile.id,
    }).select("*").single();
    if (channelError) {
      setError(channelError.message);
      return;
    }
    const memberIds = createForm.type === "public" ? employees.map((item) => item.id) : Array.from(new Set([profile.id, ...createForm.members]));
    const { error: memberError } = await supabase.from("channel_members").insert(memberIds.map((userId) => ({ channel_id: channel.id, user_id: userId })));
    if (memberError && memberError.code !== "23505") {
      setError(memberError.message);
      return;
    }
    setShowCreateModal(false);
    setCreateForm({ name: "", description: "", type: "public", members: [] });
    const nextChannels = await fetchChannels();
    await fetchChannelMembers(nextChannels);
    await fetchWorkspaceMessages(nextChannels);
    setSelectedChannelId(channel.id);
    setNotice("Channel created.");
  };

  const checkOutFromHub = async () => {
    const { data: reportSubmission } = await supabase.from("daily_report_submissions").select("id").eq("user_id", profile.id).eq("date", today).maybeSingle();
    if (!reportSubmission) {
      setError("Complete today's daily report before checking out.");
      return;
    }
    const { error: updateError } = await supabase.from("attendance").update({ check_out_time: new Date().toTimeString().slice(0, 8) }).eq("user_id", profile.id).eq("date", today);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStatusOverride("away");
    setNotice("Checked out successfully.");
    await fetchAttendanceHub();
  };

  const handleTyping = async () => {
    if (!typingChannelRef.current || !selectedChannel) return;
    const now = Date.now();
    if (now - typingSentAtRef.current < TYPING_THROTTLE_MS) return;
    typingSentAtRef.current = now;
    await typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: profile.id, user_name: profile.name } });
  };

  const renderMessage = (message, previousMessage, query, inThread = false) => {
    const grouped = sameGroup(previousMessage, message);
    const groupedReactions = Object.entries((reactionMap[message.id] ?? []).reduce((acc, item) => {
      acc[item.emoji] = acc[item.emoji] ?? [];
      acc[item.emoji].push(item);
      return acc;
    }, {}));

    return (
      <article
        key={message.id}
        className={`cliq-message${grouped ? " grouped" : ""}`}
        onMouseEnter={() => setHoveredMessageId(message.id)}
        onMouseLeave={() => {
          setHoveredMessageId("");
          setReactionTargetId((current) => (current === message.id ? "" : current));
        }}
      >
        {!grouped ? (
          <div className="cliq-avatar" style={{ background: `${getAvatarColor(message.sender?.name ?? message.sender_id)}20`, color: getAvatarColor(message.sender?.name ?? message.sender_id) }}>
            {getInitials(message.sender?.name)}
          </div>
        ) : (
          <div className="cliq-avatar spacer" />
        )}
        <div className="cliq-message-body">
          {!grouped ? (
            <div className="cliq-message-head">
              <div>
                <strong>{message.sender?.name ?? "Unknown"}</strong>
                <span>{message.sender?.department || message.sender?.email || ""}</span>
              </div>
              <time>{formatTime(message.created_at)}</time>
            </div>
          ) : (
            <div className="cliq-message-head compact"><time>{formatTime(message.created_at)}</time></div>
          )}
          {message.content ? <div className="cliq-message-text">{highlightText(message.content, query)}</div> : null}
          {message.file_url ? (
            isImage(message.file_type ?? "", message.file_url) ? (
              <a href={message.file_url} target="_blank" rel="noreferrer" className="cliq-image-card"><img src={message.file_url} alt="Shared file" className="cliq-image-preview" /></a>
            ) : (
              <a href={message.file_url} target="_blank" rel="noreferrer" className="cliq-file-card"><span>{getFileCategory(message)}</span><strong>{message.file_url.split("/").pop()?.split("?")[0] ?? "Download file"}</strong></a>
            )
          ) : null}
          {groupedReactions.length ? (
            <div className="cliq-reactions">
              {groupedReactions.map(([emoji, items]) => (
                <button key={`${message.id}-${emoji}`} type="button" className={`cliq-reaction-chip${items.some((item) => item.user_id === profile.id) ? " active" : ""}`} onClick={() => toggleReaction(message.id, emoji)}>
                  <span>{emoji}</span>
                  <span>{items.length}</span>
                </button>
              ))}
            </div>
          ) : null}
          {!inThread && channelMessages.some((item) => item.reply_to === message.id) ? <button type="button" className="cliq-thread-link" onClick={() => setThreadMessageId(message.id)}>View thread</button> : null}
          {hoveredMessageId === message.id ? (
            <div className="cliq-message-actions">
              <button type="button" onClick={() => setReactionTargetId(message.id)}>{EMOJI_OPTIONS[0]}</button>
              <button type="button" onClick={() => setThreadMessageId(message.id)}>{"\u{1F4AC}"}</button>
              <button type="button">{"\u22EE"}</button>
            </div>
          ) : null}
          {reactionTargetId === message.id ? (
            <div className="cliq-picker">
              {EMOJI_OPTIONS.map((emoji) => <button key={`${message.id}-${emoji}`} type="button" onClick={() => toggleReaction(message.id, emoji)}>{emoji}</button>)}
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  useEffect(() => {
    messagesRef.current = channelMessages;
    channelsRef.current = channels;
    channelMembersRef.current = channelMembers;
  }, [channelMembers, channelMessages, channels]);

  useEffect(() => {
    const load = async () => {
      setLoadingWorkspace(true);
      setError("");
      try {
        await fetchEmployees();
        const nextChannels = await fetchChannels();
        await Promise.all([fetchChannelMembers(nextChannels), fetchWorkspaceMessages(nextChannels), fetchAttendanceHub()]);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoadingWorkspace(false);
      }
    };
    load();
  }, [profile.company_id]);

  useEffect(() => {
    if (!selectedChannelId) {
      setChannelMessages([]);
      setReactions([]);
      return;
    }
    fetchMessages(selectedChannelId);
    markChannelRead(selectedChannelId);

    const messageChannel = supabase.channel(`cliq-messages-${selectedChannelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${selectedChannelId}` }, async (payload) => {
        if (payload.eventType === "DELETE") {
          const next = messagesRef.current.filter((item) => item.id !== payload.old.id);
          setChannelMessages(next);
          setWorkspaceMessages((current) => current.filter((item) => item.id !== payload.old.id));
          return;
        }
        const full = await fetchFullMessage(payload.new.id);
        if (!full) return;
        setChannelMessages((current) => upsertRow(current, full));
        setWorkspaceMessages((current) => upsertRow(current, full));
        scrollToBottom(listRef);
        if (full.sender_id !== profile.id) await markChannelRead(selectedChannelId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, async () => {
        const ids = messagesRef.current.map((item) => item.id);
        if (!ids.length) return;
        const reactionsResponse = await supabase.from("message_reactions").select("*").in("message_id", ids);
        if (!reactionsResponse.error) setReactions(reactionsResponse.data ?? []);
      })
      .subscribe();

    const typingChannel = supabase.channel(`cliq-typing-${selectedChannelId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.user_id === profile.id) return;
        setTypingUsers((current) => Array.from(new Set([...current, payload.user_name])));
        window.clearTimeout(typingTimeoutsRef.current[payload.user_id]);
        typingTimeoutsRef.current[payload.user_id] = window.setTimeout(() => {
          setTypingUsers((current) => current.filter((name) => name !== payload.user_name));
        }, TYPING_VISIBLE_MS);
      })
      .subscribe();

    typingChannelRef.current = typingChannel;
    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
    };
  }, [profile.id, selectedChannelId, supabase]);

  useEffect(() => {
    const presenceChannel = supabase.channel("cliq-presence", { config: { presence: { key: profile.id } } })
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const nextMap = Object.values(state).flat().reduce((acc, item) => {
          acc[item.user_id] = item;
          return acc;
        }, {});
        setPresenceMap(nextMap);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user_id: profile.id, chat_status: currentStatus, checked_in: isCheckedIn });
        }
      });
    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [currentStatus, isCheckedIn, profile.id, supabase]);
  useEffect(() => {
    const workspaceChannel = supabase.channel(`cliq-workspace-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "channels", filter: `company_id=eq.${profile.company_id}` }, async () => {
        const nextChannels = await fetchChannels();
        await fetchChannelMembers(nextChannels);
        await fetchWorkspaceMessages(nextChannels);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_members" }, async () => {
        const nextChannels = channelsRef.current.length ? channelsRef.current : await fetchChannels();
        await fetchChannelMembers(nextChannels);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: `company_id=eq.${profile.company_id}` }, fetchAttendanceHub)
      .subscribe();
    return () => {
      supabase.removeChannel(workspaceChannel);
    };
  }, [profile.company_id, profile.id, supabase]);

  useEffect(() => {
    const handleKeydown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOverlayOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOverlayOpen(false);
        setThreadMessageId("");
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    if (searchOverlayOpen) {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOverlayOpen]);

  useEffect(() => {
    if (channelMessages.length) scrollToBottom(listRef);
  }, [channelMessages.length]);

  useEffect(() => {
    if (threadReplies.length || threadParent) scrollToBottom(threadRef);
  }, [threadParent, threadReplies.length]);

  const mainIsChat = activeSection === "chats" || activeSection === "channels";

  return (
    <section className="cliq-page">
      {!!error && <div className="alert error">{error}</div>}
      {!!notice && <div className="alert success">{notice}</div>}

      <div className="cliq-shell">
        <aside className="cliq-icons">
          <button type="button" className="cliq-logo" title="WorkPulse"><span>WP</span></button>
          <div className="cliq-icon-stack">
            {ICON_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`cliq-icon-button${activeSection === item.id ? " active" : ""}`}
                onClick={() => {
                  setActiveSection(item.id);
                  if (!["chats", "channels"].includes(item.id)) setSelectedChannelId("");
                }}
                title={item.label}
              >
                <span>{item.icon}</span>
                {activeSection === item.id ? <i /> : null}
              </button>
            ))}
          </div>
          <button type="button" className={`cliq-icon-button${activeSection === "settings" ? " active" : ""}`} title="Settings" onClick={() => setActiveSection("settings")}>
            <span>{"\u2699\uFE0F"}</span>
            {activeSection === "settings" ? <i /> : null}
          </button>
        </aside>

        <aside className="cliq-sidebar">
          <div className="cliq-sidebar-top">
            <button type="button" className="cliq-search" onClick={() => setSearchOverlayOpen(true)}><span>Search in All (Ctrl+K)</span></button>
            {canManageChannels ? <button type="button" className="cliq-create" onClick={() => setShowCreateModal(true)}>+</button> : null}
          </div>

          <div className="cliq-scroll">
            <section className="cliq-section">
              <header><span>MY PINS</span></header>
              <p className="cliq-empty-copy">Keep your favorite chats within reach</p>
            </section>

            <section className="cliq-section">
              <header><span>CONVERSATIONS</span>{canManageChannels ? <button type="button" onClick={() => setShowCreateModal(true)}>+</button> : null}</header>
              <input type="search" className="cliq-filter" placeholder="Filter channels and people" value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} />
              {listedChannels.map((channel) => (
                <button key={channel.id} type="button" className={`cliq-list-item${selectedChannelId === channel.id ? " active" : ""}`} onClick={() => { setActiveSection("chats"); setSelectedChannelId(channel.id); }}>
                  <span className="cliq-list-title"># {channel.displayName}</span>
                  {unreadByChannel[channel.id] ? <span className="cliq-badge">{unreadByChannel[channel.id]}</span> : null}
                </button>
              ))}
              {filteredChannels.length > 5 ? <button type="button" className="cliq-show-all" onClick={() => setShowAllChannels((current) => !current)}>{showAllChannels ? "Show less" : "Show all"}</button> : null}
            </section>

            <section className="cliq-section">
              <header><span>DIRECT MESSAGES</span></header>
              {directMessages.map((employee) => (
                <button key={employee.id} type="button" className="cliq-dm-item" onClick={() => openDm(employee)}>
                  <span className="cliq-dm-main">
                    <span className="cliq-avatar small" style={{ background: `${getAvatarColor(employee.name)}20`, color: getAvatarColor(employee.name) }}>{getInitials(employee.name)}</span>
                    <span><strong>{employee.name}</strong><small>{employee.department || employee.email}</small></span>
                  </span>
                  <span className={`cliq-status-dot${presenceMap[employee.id]?.chat_status === "at_work" ? " online" : ""}`} />
                </button>
              ))}
            </section>
          </div>

          <div className="cliq-userbar">
            <div><strong>{profile.name}</strong><small>{remoteWork ? "Remote Work On" : "Remote Work Off"}</small></div>
            <button type="button" className={`cliq-toggle${remoteWork ? " on" : ""}`} onClick={() => setRemoteWork((current) => !current)}><span /></button>
          </div>
        </aside>

        <div className="cliq-main">
          {mainIsChat && !selectedChannel ? (
            <>
              <header className="cliq-statusbar">
                <div className="cliq-live-pill"><span>{"\u{1F4F9}"}</span><span>Live video feed:</span></div>
                <div className="cliq-status-actions">
                  <span>Status:</span>
                  <button type="button" className={`cliq-status-chip${currentStatus === "at_work" ? " active green" : ""}`} onClick={() => setStatusOverride("at_work")}>{"\u{1F5A5}\uFE0F"} At Work</button>
                  <button type="button" className={`cliq-status-chip${currentStatus === "away" ? " active red" : ""}`} onClick={() => setStatusOverride("away")}>{"\u{1F3AF}"} Away</button>
                  <button type="button" className={`cliq-status-chip${currentStatus === "out_of_office" ? " active" : ""}`} onClick={() => setStatusOverride("out_of_office")}>{"\u{1F319}"} Out of Office</button>
                </div>
                {isCheckedIn ? <button type="button" className="ghost-button" onClick={checkOutFromHub}>Check Out</button> : <button type="button" className="primary-button" onClick={() => navigate("/app/attendance")}>Check In</button>}
              </header>

              <div className="cliq-home-grid">
                <section className="cliq-home-card">
                  <header><h3>At Work ({atWorkPeople.length})</h3></header>
                  {atWorkPeople.map(({ employee }) => (
                    <div key={employee.id} className="cliq-person-row"><span className="cliq-status-bullet green" /><span className="cliq-avatar tiny" style={{ background: `${getAvatarColor(employee.name)}20`, color: getAvatarColor(employee.name) }}>{getInitials(employee.name)}</span><div><strong>{employee.name}</strong><small>{employee.email}</small></div></div>
                  ))}
                  {!atWorkPeople.length ? <p className="cliq-empty-copy">Nobody is marked at work right now.</p> : null}
                </section>
                <section className="cliq-home-card">
                  <header><h3>Away ({awayPeople.length})</h3></header>
                  {awayPeople.map(({ employee, status }) => (
                    <div key={employee.id} className="cliq-person-row"><span className={`cliq-status-bullet${status === "out_of_office" ? "" : " red"}`} /><span className="cliq-avatar tiny" style={{ background: `${getAvatarColor(employee.name)}20`, color: getAvatarColor(employee.name) }}>{getInitials(employee.name)}</span><div><strong>{employee.name}</strong><small>{status === "out_of_office" ? "On Leave / Out of Office" : "Away"}</small></div></div>
                  ))}
                </section>
                <section className="cliq-home-card">
                  <header><h3>Meetings</h3></header>
                  <div className="cliq-meeting-empty"><p>No ongoing or scheduled meetings</p><button type="button" className="ghost-button" disabled>Schedule Meeting</button></div>
                </section>
              </div>
            </>
          ) : activeSection === "files" ? (
            <div className="cliq-content-view">
              <header className="cliq-view-header"><h2>Shared Files</h2><p>Everything shared across your accessible chats.</p></header>
              {Object.entries(groupedFiles).map(([category, items]) => (
                <section key={category} className="cliq-file-section"><h3>{category}</h3><div className="cliq-file-grid">{items.map((item) => <a key={item.id} href={item.file_url} target="_blank" rel="noreferrer" className="cliq-file-tile"><strong>{item.file_url.split("/").pop()?.split("?")[0] ?? "Shared file"}</strong><span>{channelsWithMeta.find((channel) => channel.id === item.channel_id)?.displayName ?? "Unknown channel"}</span><small>{formatTime(item.created_at)}</small></a>)}</div></section>
              ))}
              {!fileMessages.length ? <div className="empty-state">No files have been shared yet.</div> : null}
            </div>
          ) : activeSection === "history" ? (
            <div className="cliq-content-view">
              <header className="cliq-view-header"><h2>History</h2><p>Recent chat activity across your workspace.</p></header>
              <div className="cliq-history-list">{workspaceMessages.slice().reverse().slice(0, 20).map((item) => <button key={item.id} type="button" className="cliq-history-item" onClick={() => { setActiveSection("chats"); setSelectedChannelId(item.channel_id); }}><strong>{item.sender?.name ?? "Unknown"}</strong><span>{item.content || "Shared a file"}</span></button>)}</div>
            </div>
          ) : activeSection === "org" ? (
            <div className="cliq-content-view">
              <header className="cliq-view-header"><h2>Org Chart</h2><p>Your company structure grouped like Cliq's org view.</p></header>
              <div className="cliq-org-grid">
                <section className="cliq-org-column"><h3>Admin</h3>{employees.filter((item) => item.role === "admin").map((item) => <div key={item.id} className="cliq-org-card">{item.name}<small>{item.department || "Leadership"}</small></div>)}</section>
                <section className="cliq-org-column"><h3>HR</h3>{employees.filter((item) => item.role === "hr").map((item) => <div key={item.id} className="cliq-org-card">{item.name}<small>{item.department || "HR"}</small></div>)}</section>
                <section className="cliq-org-column"><h3>Employees</h3>{employees.filter((item) => item.role === "employee").map((item) => <div key={item.id} className="cliq-org-card">{item.name}<small>{item.department || "General"}</small></div>)}</section>
              </div>
            </div>
          ) : !mainIsChat ? (
            <div className="cliq-content-view"><header className="cliq-view-header"><h2>{ICON_ITEMS.find((item) => item.id === activeSection)?.label || "Section"}</h2><p>Future WorkPulse hub module.</p></header><div className="empty-state">This section is ready for the next feature pass.</div></div>
          ) : (
            <>
              <header className="cliq-chatbar">
                <div><h2>{selectedChannel?.type === "direct" ? selectedChannel.displayName : `# ${selectedChannel?.displayName}`}</h2><p>{selectedChannel ? `${selectedChannel.memberCount} members` : ""}</p></div>
                <div className="cliq-chatbar-actions"><button type="button" className="ghost-button" onClick={() => setSearchOverlayOpen(true)}>Search Messages</button><button type="button" className="ghost-button" disabled>Video Call</button><button type="button" className="ghost-button" onClick={() => setThreadMessageId("")}>Info</button></div>
              </header>
              <div className="cliq-messages" ref={listRef}>
                {loadingWorkspace || loadingMessages ? <div className="empty-state">Loading chat...</div> : null}
                {!visibleMessages.length && !loadingMessages ? <div className="empty-state">No messages yet. Start the conversation.</div> : null}
                {visibleMessages.map((message, index) => {
                  const previousMessage = visibleMessages[index - 1];
                  const showDay = !previousMessage || new Date(previousMessage.created_at).toDateString() !== new Date(message.created_at).toDateString();
                  return <div key={message.id}>{showDay ? <div className="cliq-divider"><span>{getDayLabel(message.created_at)}</span></div> : null}{firstUnreadMessageId === message.id ? <div className="cliq-divider unread"><span>New Messages</span></div> : null}{renderMessage(message, previousMessage, messageQuery)}</div>;
                })}
              </div>
              <div className="cliq-composer-wrap">
                {typingUsers.length ? <div className="cliq-typing">{typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...</div> : null}
                {mainAttachment ? <div className="cliq-attachment-pill"><span>{mainAttachment.file.name}</span><button type="button" onClick={() => setMainAttachment(null)}>Remove</button></div> : null}
                <div className="cliq-composer">
                  <button type="button" onClick={() => fileInputRef.current?.click()}>{"\u{1F4CE}"}</button>
                  <button type="button" onClick={() => setMessageText((current) => `${current}\u{1F642}`)}>{"\u{1F60A}"}</button>
                  <textarea value={messageText} placeholder={selectedChannel ? `Message ${selectedChannel.type === "direct" ? selectedChannel.displayName : `#${selectedChannel.displayName}`}` : "Message"} onChange={async (event) => { setMessageText(event.target.value); await handleTyping(); }} onKeyDown={async (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); await sendMessage({ text: messageText, attachment: mainAttachment, clear: () => { setMessageText(""); setMainAttachment(null); } }); } }} />
                  <button type="button" className="primary-button" onClick={async () => sendMessage({ text: messageText, attachment: mainAttachment, clear: () => { setMessageText(""); setMainAttachment(null); } })} disabled={sending}>Send</button>
                  <input ref={fileInputRef} hidden type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) setMainAttachment({ file }); event.target.value = ""; }} />
                </div>
              </div>
            </>
          )}
        </div>

        {threadMessageId ? (
          <aside className="cliq-thread">
            <header><div><h3>Thread</h3><p>{threadReplies.length} replies</p></div><button type="button" onClick={() => setThreadMessageId("")}><Icon name="close" /></button></header>
            <div className="cliq-thread-body" ref={threadRef}>{threadParent ? <div className="cliq-thread-origin">{renderMessage(threadParent, null, messageQuery, true)}</div> : null}{threadReplies.map((item, index) => renderMessage(item, threadReplies[index - 1] ?? threadParent, messageQuery, true))}</div>
            <div className="cliq-composer-wrap thread">
              {threadAttachment ? <div className="cliq-attachment-pill"><span>{threadAttachment.file.name}</span><button type="button" onClick={() => setThreadAttachment(null)}>Remove</button></div> : null}
              <div className="cliq-composer">
                <button type="button" onClick={() => threadFileInputRef.current?.click()}>{"\u{1F4CE}"}</button>
                <textarea value={threadText} placeholder="Reply in thread" onChange={async (event) => { setThreadText(event.target.value); await handleTyping(); }} onKeyDown={async (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); await sendMessage({ text: threadText, attachment: threadAttachment, replyTo: threadMessageId, clear: () => { setThreadText(""); setThreadAttachment(null); } }); } }} />
                <button type="button" className="primary-button" onClick={async () => sendMessage({ text: threadText, attachment: threadAttachment, replyTo: threadMessageId, clear: () => { setThreadText(""); setThreadAttachment(null); } })}>Reply</button>
                <input ref={threadFileInputRef} hidden type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) setThreadAttachment({ file }); event.target.value = ""; }} />
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      {searchOverlayOpen ? (
        <div className="cliq-search-overlay" onClick={() => setSearchOverlayOpen(false)}>
          <div className="cliq-search-panel" onClick={(event) => event.stopPropagation()}>
            <input ref={searchInputRef} type="search" placeholder="Search messages, channels, people, files" value={searchOverlayQuery} onChange={(event) => setSearchOverlayQuery(event.target.value)} />
            <div className="cliq-search-grid">
              <section><h4>Channels</h4>{searchResults.channels.map((item) => <button key={item.id} type="button" onClick={() => { setActiveSection("chats"); setSelectedChannelId(item.id); setSearchOverlayOpen(false); }}># {item.displayName}</button>)}</section>
              <section><h4>People</h4>{searchResults.people.map((item) => <button key={item.id} type="button" onClick={() => { openDm(item); setSearchOverlayOpen(false); }}>{item.name}</button>)}</section>
              <section><h4>Messages</h4>{searchResults.messages.map((item) => <button key={item.id} type="button" onClick={() => { setActiveSection("chats"); setSelectedChannelId(item.channel_id); setSearchOverlayOpen(false); }}>{item.content || "Shared a file"}</button>)}</section>
              <section><h4>Files</h4>{searchResults.files.map((item) => <a key={item.id} href={item.file_url} target="_blank" rel="noreferrer">{item.file_url.split("/").pop()?.split("?")[0] ?? "File"}</a>)}</section>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateModal ? (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <div className="modal-header">
              <div><h2>Create Channel</h2><p>New conversation space</p></div>
              <button type="button" className="icon-button" onClick={() => setShowCreateModal(false)}><Icon name="close" /></button>
            </div>
            <div className="modal-body">
              <div className="stack">
                <label className="field"><span>Name</span><input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="field"><span>Description</span><textarea value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} /></label>
                <label className="field"><span>Type</span><select value={createForm.type} onChange={(event) => setCreateForm((current) => ({ ...current, type: event.target.value }))}><option value="public">Public</option><option value="private">Private</option></select></label>
                {createForm.type === "private" ? <div className="cliq-member-pick">{employees.map((employee) => <label key={employee.id} className="checkbox-row"><input type="checkbox" checked={employee.id === profile.id || createForm.members.includes(employee.id)} disabled={employee.id === profile.id} onChange={(event) => setCreateForm((current) => ({ ...current, members: event.target.checked ? [...current.members, employee.id] : current.members.filter((item) => item !== employee.id) }))} />{employee.name}</label>)}</div> : null}
              </div>
              <div className="row-end" style={{ marginTop: 20 }}>
                <button type="button" className="ghost-button" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="button" className="primary-button" onClick={createChannel}>Create Channel</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
