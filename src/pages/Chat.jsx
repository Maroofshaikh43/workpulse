import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Icon } from "../brand";
import { formatTime } from "../utils";

const DEFAULT_CHANNELS = [
  { name: "general", description: "Company wide conversations" },
  { name: "announcements", description: "Important updates" },
  { name: "hr", description: "HR updates and policies" },
  { name: "random", description: "Fun and casual" },
];

const EMOJI_OPTIONS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F389}"];
const MESSAGE_GROUP_GAP_MS = 5 * 60 * 1000;
const TYPING_THROTTLE_MS = 2000;
const TYPING_VISIBLE_MS = 3000;

function getInitials(name) {
  if (!name) return "U";
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getAvatarColor(seed = "") {
  const palette = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#6366f1", "#ec4899"];
  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[total % palette.length];
}

function isImage(fileType = "", fileUrl = "") {
  return fileType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileUrl);
}

function createDirectChannelName(userId, otherUserId) {
  return `dm-${[userId, otherUserId].sort().join("-")}`;
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightContent(text, query) {
  if (!query.trim()) return text;
  const matcher = new RegExp(`(${escapeForRegex(query)})`, "ig");
  return text.split(matcher).map((part, index) =>
    matcher.test(part) ? (
      <mark key={`${part}-${index}`} className="chat-highlight">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function formatDayDividerLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function isSameGroup(previousMessage, currentMessage) {
  if (!previousMessage) return false;
  const previousDate = new Date(previousMessage.created_at);
  const currentDate = new Date(currentMessage.created_at);

  return (
    previousMessage.sender_id === currentMessage.sender_id &&
    previousDate.toDateString() === currentDate.toDateString() &&
    currentDate.getTime() - previousDate.getTime() < MESSAGE_GROUP_GAP_MS
  );
}

function sortByCreatedAt(rows) {
  return [...rows].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
}

function upsertById(rows, nextRow) {
  const filtered = rows.filter((item) => item.id !== nextRow.id);
  return sortByCreatedAt([...filtered, nextRow]);
}

function buildUnreadMap(messageRows, membershipRows, currentUserId) {
  const lastReadMap = membershipRows.reduce((accumulator, membership) => {
    accumulator[membership.channel_id] = membership.last_read_at ? new Date(membership.last_read_at).getTime() : 0;
    return accumulator;
  }, {});

  return messageRows.reduce((accumulator, message) => {
    const createdAt = message.created_at ? new Date(message.created_at).getTime() : 0;
    const lastReadAt = lastReadMap[message.channel_id] ?? 0;
    if (message.sender_id !== currentUserId && createdAt > lastReadAt) {
      accumulator[message.channel_id] = (accumulator[message.channel_id] ?? 0) + 1;
    }
    return accumulator;
  }, {});
}

function scrollToBottom(elementRef) {
  window.requestAnimationFrame(() => {
    if (!elementRef.current) return;
    elementRef.current.scrollTop = elementRef.current.scrollHeight;
  });
}

export default function Chat() {
  const { supabase, profile, refreshChatUnreadCount } = useOutletContext();
  const canManageChannels = profile.role === "admin" || profile.role === "hr";

  const [employees, setEmployees] = useState([]);
  const [channels, setChannels] = useState([]);
  const [channelMembers, setChannelMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [unreadByChannel, setUnreadByChannel] = useState({});
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [threadMessageId, setThreadMessageId] = useState("");
  const [channelSearch, setChannelSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [threadMessageText, setThreadMessageText] = useState("");
  const [mainAttachment, setMainAttachment] = useState(null);
  const [threadAttachment, setThreadAttachment] = useState(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState("");
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [createChannelForm, setCreateChannelForm] = useState({
    name: "",
    description: "",
    type: "public",
    members: [],
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const messageListRef = useRef(null);
  const threadListRef = useRef(null);
  const mainFileInputRef = useRef(null);
  const threadFileInputRef = useRef(null);
  const typingChannelRef = useRef(null);
  const typingTimeoutsRef = useRef({});
  const typingSentAtRef = useRef(0);
  const activeChannelIdRef = useRef("");
  const messagesRef = useRef([]);
  const channelsRef = useRef([]);
  const channelMembersRef = useRef([]);

  const employeesById = useMemo(
    () =>
      employees.reduce((accumulator, employee) => {
        accumulator[employee.id] = employee;
        return accumulator;
      }, {}),
    [employees],
  );

  const membershipsByChannel = useMemo(
    () =>
      channelMembers.reduce((accumulator, membership) => {
        if (!accumulator[membership.channel_id]) {
          accumulator[membership.channel_id] = [];
        }
        accumulator[membership.channel_id].push(membership);
        return accumulator;
      }, {}),
    [channelMembers],
  );

  const channelsWithMeta = useMemo(
    () =>
      channels.map((channel) => {
        const members = membershipsByChannel[channel.id] ?? [];
        const directPartner =
          channel.type === "direct"
            ? members
                .map((member) => employeesById[member.user_id])
                .find((employee) => employee && employee.id !== profile.id) ?? null
            : null;

        const displayName = channel.type === "direct" ? directPartner?.name ?? "Direct message" : channel.name;
        const descriptionLabel =
          channel.type === "direct"
            ? directPartner?.department || directPartner?.email || "Direct message"
            : channel.description || "No description yet.";

        return {
          ...channel,
          members,
          memberCount: members.length,
          directPartner,
          displayName,
          descriptionLabel,
        };
      }),
    [channels, employeesById, membershipsByChannel, profile.id],
  );

  const selectedChannel = useMemo(
    () => channelsWithMeta.find((channel) => channel.id === selectedChannelId) ?? null,
    [channelsWithMeta, selectedChannelId],
  );

  const channelMembership = useMemo(
    () => channelMembers.find((member) => member.channel_id === selectedChannelId && member.user_id === profile.id) ?? null,
    [channelMembers, profile.id, selectedChannelId],
  );

  const topLevelMessages = useMemo(
    () => sortByCreatedAt(messages.filter((item) => !item.reply_to)),
    [messages],
  );

  const threadParent = useMemo(
    () => messages.find((item) => item.id === threadMessageId) ?? null,
    [messages, threadMessageId],
  );

  const threadReplies = useMemo(
    () => sortByCreatedAt(messages.filter((item) => item.reply_to === threadMessageId)),
    [messages, threadMessageId],
  );

  const visibleMessages = useMemo(() => {
    if (!messageSearch.trim()) return topLevelMessages;

    const query = messageSearch.trim().toLowerCase();
    return topLevelMessages.filter((messageRow) => {
      const senderName = messageRow.sender?.name ?? employeesById[messageRow.sender_id]?.name ?? "";
      const contentMatches = (messageRow.content ?? "").toLowerCase().includes(query);
      const senderMatches = senderName.toLowerCase().includes(query);
      const replyMatches = messages.some(
        (reply) =>
          reply.reply_to === messageRow.id &&
          (((reply.content ?? "").toLowerCase().includes(query)) ||
            ((reply.sender?.name ?? employeesById[reply.sender_id]?.name ?? "").toLowerCase().includes(query))),
      );

      return contentMatches || senderMatches || replyMatches;
    });
  }, [employeesById, messageSearch, messages, topLevelMessages]);

  const firstUnreadMessageId = useMemo(() => {
    const lastReadAt = channelMembership?.last_read_at ? new Date(channelMembership.last_read_at).getTime() : 0;
    return visibleMessages.find(
      (messageRow) => messageRow.sender_id !== profile.id && new Date(messageRow.created_at).getTime() > lastReadAt,
    )?.id;
  }, [channelMembership?.last_read_at, profile.id, visibleMessages]);

  const reactionMap = useMemo(
    () =>
      reactions.reduce((accumulator, reaction) => {
        if (!accumulator[reaction.message_id]) {
          accumulator[reaction.message_id] = [];
        }
        accumulator[reaction.message_id].push(reaction);
        return accumulator;
      }, {}),
    [reactions],
  );

  const filteredChannels = useMemo(() => {
    const query = channelSearch.trim().toLowerCase();
    return channelsWithMeta.filter((channel) => {
      if (channel.type === "direct") return false;
      if (!query) return true;
      return `${channel.name} ${channel.description ?? ""}`.toLowerCase().includes(query);
    });
  }, [channelSearch, channelsWithMeta]);

  const filteredEmployees = useMemo(() => {
    const query = channelSearch.trim().toLowerCase();
    return employees.filter((employee) => {
      if (employee.id === profile.id) return false;
      if (!query) return true;
      return `${employee.name} ${employee.email} ${employee.department ?? ""}`.toLowerCase().includes(query);
    });
  }, [channelSearch, employees, profile.id]);

  const fetchEmployees = async () => {
    const { data, error: fetchError } = await supabase
      .from("users")
      .select("id, name, email, department, role, profile_photo_url")
      .eq("company_id", profile.company_id)
      .order("name");

    if (fetchError) {
      setError(fetchError.message);
      return [];
    }

    const employeeRows = data ?? [];
    setEmployees(employeeRows);
    return employeeRows;
  };

  const fetchUnreadCounts = async (channelRows, membershipRows) => {
    const channelIds = channelRows.map((channel) => channel.id);
    if (!channelIds.length) {
      setUnreadByChannel({});
      refreshChatUnreadCount?.();
      return;
    }

    const { data, error: fetchError } = await supabase
      .from("messages")
      .select("channel_id, created_at, sender_id")
      .in("channel_id", channelIds)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setUnreadByChannel(
      buildUnreadMap((data ?? []), membershipRows.filter((membership) => membership.user_id === profile.id), profile.id),
    );
    refreshChatUnreadCount?.();
  };

  const fetchChannelMembers = async (channelRows) => {
    const channelIds = channelRows.map((channel) => channel.id);
    if (!channelIds.length) {
      setChannelMembers([]);
      return [];
    }

    const { data, error: fetchError } = await supabase
      .from("channel_members")
      .select("id, channel_id, user_id, last_read_at, created_at")
      .in("channel_id", channelIds)
      .order("created_at");

    if (fetchError) {
      setError(fetchError.message);
      return [];
    }

    const memberRows = data ?? [];
    setChannelMembers(memberRows);
    return memberRows;
  };

  const createDefaultChannels = async () => {
    const { data: employeeRows, error: employeeError } = await supabase
      .from("users")
      .select("id")
      .eq("company_id", profile.company_id);

    if (employeeError) {
      setError(employeeError.message);
      return;
    }

    for (const channel of DEFAULT_CHANNELS) {
      const { data: createdChannel, error: createError } = await supabase
        .from("channels")
        .insert({
          company_id: profile.company_id,
          name: channel.name,
          description: channel.description,
          type: "public",
          created_by: profile.id,
        })
        .select("*")
        .single();

      if (createError) {
        const duplicate = createError.code === "23505" || /duplicate/i.test(createError.message ?? "");
        if (!duplicate) {
          setError(createError.message);
          return;
        }
        continue;
      }

      if (createdChannel && (employeeRows ?? []).length) {
        const { error: memberError } = await supabase.from("channel_members").insert(
          employeeRows.map((employee) => ({
            channel_id: createdChannel.id,
            user_id: employee.id,
          })),
        );

        if (memberError && memberError.code !== "23505") {
          setError(memberError.message);
          return;
        }
      }
    }
  };

  const fetchChannels = async ({ keepSelection = true } = {}) => {
    setLoadingWorkspace(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("channels")
      .select("*, channel_members!inner(user_id)")
      .eq("company_id", profile.company_id)
      .eq("channel_members.user_id", profile.id)
      .order("name");

    if (fetchError) {
      setError(fetchError.message);
      setLoadingWorkspace(false);
      return [];
    }

    let channelRows = data ?? [];
    if (!channelRows.length) {
      await createDefaultChannels();

      const retry = await supabase
        .from("channels")
        .select("*, channel_members!inner(user_id)")
        .eq("company_id", profile.company_id)
        .eq("channel_members.user_id", profile.id)
        .order("name");

      if (retry.error) {
        setError(retry.error.message);
        setLoadingWorkspace(false);
        return [];
      }

      channelRows = retry.data ?? [];
    }

    const cleanedChannels = channelRows.map(({ channel_members: ignored, ...channel }) => channel);
    setChannels(cleanedChannels);

    const membershipRows = await fetchChannelMembers(cleanedChannels);
    await fetchUnreadCounts(cleanedChannels, membershipRows);

    if (!keepSelection || !cleanedChannels.some((channel) => channel.id === activeChannelIdRef.current)) {
      const defaultChannel =
        cleanedChannels.find((channel) => channel.name === "general") ??
        cleanedChannels.find((channel) => channel.type !== "direct") ??
        cleanedChannels[0] ??
        null;
      setSelectedChannelId(defaultChannel?.id ?? "");
    }

    setLoadingWorkspace(false);
    return cleanedChannels;
  };

  const fetchReactions = async (channelId, messageRows = null) => {
    const sourceRows = messageRows ?? messages;
    const ids = sourceRows.filter((item) => item.channel_id === channelId).map((item) => item.id);

    if (!ids.length) {
      setReactions([]);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from("message_reactions")
      .select("id, message_id, user_id, emoji, created_at")
      .in("message_id", ids)
      .order("created_at");

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setReactions(data ?? []);
  };

  const fetchMessageById = async (messageId) => {
    const { data, error: fetchError } = await supabase
      .from("messages")
      .select(
        "id, channel_id, company_id, sender_id, content, file_url, file_type, reply_to, edited_at, created_at, sender:users!messages_sender_id_fkey(id, name, department, profile_photo_url)",
      )
      .eq("id", messageId)
      .single();

    if (fetchError) {
      setError(fetchError.message);
      return null;
    }

    return data;
  };

  const fetchMessages = async (channelId) => {
    if (!channelId) {
      setMessages([]);
      setReactions([]);
      return;
    }

    setLoadingMessages(true);
    const { data, error: fetchError } = await supabase
      .from("messages")
      .select(
        "id, channel_id, company_id, sender_id, content, file_url, file_type, reply_to, edited_at, created_at, sender:users!messages_sender_id_fkey(id, name, department, profile_photo_url)",
      )
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      setLoadingMessages(false);
      return;
    }

    const nextMessages = data ?? [];
    setMessages(nextMessages);
    await fetchReactions(channelId, nextMessages);
    setLoadingMessages(false);
    scrollToBottom(messageListRef);
  };

  const markChannelRead = async (channelId) => {
    if (!channelId) return;

    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("channel_members")
      .update({ last_read_at: timestamp })
      .eq("channel_id", channelId)
      .eq("user_id", profile.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setChannelMembers((current) =>
      current.map((membership) =>
        membership.channel_id === channelId && membership.user_id === profile.id
          ? { ...membership, last_read_at: timestamp }
          : membership,
      ),
    );

    setUnreadByChannel((current) => ({ ...current, [channelId]: 0 }));
    refreshChatUnreadCount?.();
  };

  const uploadAttachment = async (file) => {
    if (!file) return { fileUrl: null, fileType: null };

    const sanitizedName = file.name.replace(/\s+/g, "-");
    const filePath = `${profile.company_id}/${selectedChannelId}/${profile.id}/${Date.now()}-${sanitizedName}`;
    const { error: uploadError } = await supabase.storage.from("chat-files").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("chat-files").getPublicUrl(filePath);
    return {
      fileUrl: data.publicUrl,
      fileType: file.type || null,
    };
  };

  const sendMessage = async ({ text, attachment, replyTo = null, onReset }) => {
    if (!selectedChannel) return;

    const trimmedText = text.trim();
    if (!trimmedText && !attachment?.file) return;

    setSending(true);
    setError("");

    if (onReset) onReset();

    try {
      const upload = await uploadAttachment(attachment?.file ?? null);
      const { error: insertError } = await supabase.from("messages").insert({
        channel_id: selectedChannel.id,
        company_id: profile.company_id,
        sender_id: profile.id,
        content: trimmedText || null,
        file_url: upload.fileUrl,
        file_type: upload.fileType,
        reply_to: replyTo,
      });

      if (insertError) throw insertError;
      await markChannelRead(selectedChannel.id);
    } catch (sendError) {
      setError(sendError.message);
      if (replyTo) {
        setThreadMessageText(text);
        setThreadAttachment(attachment ?? null);
      } else {
        setMessageText(text);
        setMainAttachment(attachment ?? null);
      }
    } finally {
      setSending(false);
    }
  };

  const addReaction = async (messageId, emoji) => {
    const existing = reactions.find(
      (reaction) => reaction.message_id === messageId && reaction.user_id === profile.id && reaction.emoji === emoji,
    );

    if (existing) {
      const { error: deleteError } = await supabase.from("message_reactions").delete().eq("id", existing.id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: profile.id,
        emoji,
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
    }

    setReactionPickerMessageId("");
    await fetchReactions(selectedChannelId);
  };

  const openDM = async (otherUser) => {
    const directName = createDirectChannelName(profile.id, otherUser.id);
    const existing = channels.find(
      (channel) =>
        channel.type === "direct" &&
        (channel.name === directName ||
          (channel.name.includes(profile.id) && channel.name.includes(otherUser.id))),
    );

    if (existing) {
      setSelectedChannelId(existing.id);
      return;
    }

    const { data: newDM, error: channelError } = await supabase
      .from("channels")
      .insert({
        company_id: profile.company_id,
        name: directName,
        type: "direct",
        created_by: profile.id,
      })
      .select("*")
      .single();

    if (channelError) {
      setError(channelError.message);
      return;
    }

    const { error: memberError } = await supabase.from("channel_members").insert([
      { channel_id: newDM.id, user_id: profile.id },
      { channel_id: newDM.id, user_id: otherUser.id },
    ]);

    if (memberError) {
      setError(memberError.message);
      return;
    }

    await fetchChannels({ keepSelection: false });
    setSelectedChannelId(newDM.id);
  };

  const createChannel = async () => {
    if (!canManageChannels) return;

    const name = createChannelForm.name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) {
      setError("Channel name is required.");
      return;
    }

    const { data: channelRow, error: channelError } = await supabase
      .from("channels")
      .insert({
        company_id: profile.company_id,
        name,
        description: createChannelForm.description.trim() || null,
        type: createChannelForm.type,
        created_by: profile.id,
      })
      .select("*")
      .single();

    if (channelError) {
      setError(channelError.message);
      return;
    }

    const memberIds =
      createChannelForm.type === "public"
        ? employees.map((employee) => employee.id)
        : Array.from(new Set([profile.id, ...createChannelForm.members]));

    if (memberIds.length) {
      const { error: memberError } = await supabase.from("channel_members").insert(
        memberIds.map((userId) => ({
          channel_id: channelRow.id,
          user_id: userId,
        })),
      );

      if (memberError && memberError.code !== "23505") {
        setError(memberError.message);
        return;
      }
    }

    setShowCreateChannelModal(false);
    setCreateChannelForm({ name: "", description: "", type: "public", members: [] });
    setNotice("Channel created.");
    await fetchChannels({ keepSelection: false });
    setSelectedChannelId(channelRow.id);
  };

  const saveEditedMessage = async (messageId) => {
    const nextValue = editingValue.trim();
    if (!nextValue) {
      setError("Message text cannot be empty.");
      return;
    }

    const { error: updateError } = await supabase
      .from("messages")
      .update({ content: nextValue, edited_at: new Date().toISOString() })
      .eq("id", messageId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEditingMessageId("");
    setEditingValue("");
  };

  const deleteMessage = async (messageId) => {
    if (!window.confirm("Delete this message?")) return;

    const { error: deleteError } = await supabase.from("messages").delete().eq("id", messageId);
    if (deleteError) {
      setError(deleteError.message);
    }
  };

  const handleTyping = async () => {
    if (!typingChannelRef.current || !selectedChannelId) return;

    const now = Date.now();
    if (now - typingSentAtRef.current < TYPING_THROTTLE_MS) return;
    typingSentAtRef.current = now;

    await typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: profile.id,
        user_name: profile.name,
      },
    });
  };

  const handleMainComposerChange = async (event) => {
    setMessageText(event.target.value);
    await handleTyping();
  };

  const handleThreadComposerChange = async (event) => {
    setThreadMessageText(event.target.value);
    await handleTyping();
  };

  const handleMessageKeyDown = async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage({
        text: messageText,
        attachment: mainAttachment,
        onReset: () => {
          setMessageText("");
          setMainAttachment(null);
        },
      });
    }
  };

  const handleThreadKeyDown = async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage({
        text: threadMessageText,
        attachment: threadAttachment,
        replyTo: threadMessageId,
        onReset: () => {
          setThreadMessageText("");
          setThreadAttachment(null);
        },
      });
    }
  };

  const renderAttachment = (messageRow) => {
    if (!messageRow.file_url) return null;

    if (isImage(messageRow.file_type ?? "", messageRow.file_url)) {
      return (
        <a href={messageRow.file_url} target="_blank" rel="noreferrer" className="chat-image-link">
          <img src={messageRow.file_url} alt="Chat attachment" className="chat-image-preview" />
        </a>
      );
    }

    const filename = messageRow.file_url.split("/").pop()?.split("?")[0] ?? "Download file";
    return (
      <a href={messageRow.file_url} target="_blank" rel="noreferrer" className="chat-file-card">
        <span className="chat-file-icon">FILE</span>
        <span className="chat-file-copy">
          <strong>{filename}</strong>
          <small>{messageRow.file_type || "Attachment"}</small>
        </span>
      </a>
    );
  };

  const renderReactionRow = (messageId) => {
    const grouped = (reactionMap[messageId] ?? []).reduce((accumulator, reaction) => {
      accumulator[reaction.emoji] = accumulator[reaction.emoji] ?? [];
      accumulator[reaction.emoji].push(reaction);
      return accumulator;
    }, {});

    const entries = Object.entries(grouped);
    if (!entries.length) return null;

    return (
      <div className="chat-reaction-row">
        {entries.map(([emoji, items]) => (
          <button
            key={`${messageId}-${emoji}`}
            type="button"
            className={`chat-reaction-chip${items.some((item) => item.user_id === profile.id) ? " active" : ""}`}
            onClick={() => addReaction(messageId, emoji)}
          >
            <span>{emoji}</span>
            <span>{items.length}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderMessage = (messageRow, previousMessage, query, inThread = false) => {
    const sender = messageRow.sender ?? employeesById[messageRow.sender_id];
    const grouped = isSameGroup(previousMessage, messageRow);
    const canEdit = messageRow.sender_id === profile.id;
    const canDelete = canEdit || canManageChannels;
    const replyCount = messages.filter((item) => item.reply_to === messageRow.id).length;

    return (
      <article
        key={messageRow.id}
        className={`chat-message${grouped ? " grouped" : ""}`}
        onMouseEnter={() => setHoveredMessageId(messageRow.id)}
        onMouseLeave={() => {
          setHoveredMessageId((current) => (current === messageRow.id ? "" : current));
          setReactionPickerMessageId((current) => (current === messageRow.id ? "" : current));
        }}
      >
        {!grouped ? (
          <div
            className="chat-avatar"
            style={{
              background: `${getAvatarColor(sender?.name ?? messageRow.sender_id)}20`,
              color: getAvatarColor(sender?.name ?? messageRow.sender_id),
            }}
          >
            {getInitials(sender?.name)}
          </div>
        ) : (
          <div className="chat-avatar chat-avatar-spacer" />
        )}

        <div className="chat-message-body">
          {!grouped ? (
            <div className="chat-message-head">
              <div className="chat-message-author">
                <strong>{sender?.name ?? "Unknown user"}</strong>
                {sender?.department ? <span>{sender.department}</span> : null}
              </div>
              <time>{formatTime(messageRow.created_at)}</time>
            </div>
          ) : (
            <div className="chat-message-head compact">
              <time>{formatTime(messageRow.created_at)}</time>
            </div>
          )}

          {editingMessageId === messageRow.id ? (
            <div className="chat-edit-box">
              <textarea value={editingValue} onChange={(event) => setEditingValue(event.target.value)} />
              <div className="chat-inline-actions">
                <button type="button" className="ghost-button" onClick={() => setEditingMessageId("")}>
                  Cancel
                </button>
                <button type="button" className="primary-button" onClick={() => saveEditedMessage(messageRow.id)}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {messageRow.content ? <div className="chat-message-text">{highlightContent(messageRow.content, query)}</div> : null}
              {renderAttachment(messageRow)}
              {messageRow.edited_at ? <span className="chat-edited-label">edited</span> : null}
            </>
          )}

          {renderReactionRow(messageRow.id)}

          {!inThread && replyCount > 0 ? (
            <button type="button" className="chat-thread-link" onClick={() => setThreadMessageId(messageRow.id)}>
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </button>
          ) : null}

          {hoveredMessageId === messageRow.id ? (
            <div className="chat-action-bar">
              <button type="button" className="chat-action-button" onClick={() => setReactionPickerMessageId(messageRow.id)}>
                {"\u{1F44D}"}
              </button>
              <button type="button" className="chat-action-button" onClick={() => setThreadMessageId(messageRow.id)}>
                {"\u{1F4AC}"}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="chat-action-button"
                  onClick={() => {
                    setEditingMessageId(messageRow.id);
                    setEditingValue(messageRow.content ?? "");
                  }}
                >
                  {"\u270F\uFE0F"}
                </button>
              ) : null}
              {canDelete ? (
                <button type="button" className="chat-action-button danger" onClick={() => deleteMessage(messageRow.id)}>
                  {"\u{1F5D1}\uFE0F"}
                </button>
              ) : null}
            </div>
          ) : null}

          {reactionPickerMessageId === messageRow.id ? (
            <div className="chat-emoji-picker">
              {EMOJI_OPTIONS.map((emoji) => (
                <button key={`${messageRow.id}-${emoji}`} type="button" onClick={() => addReaction(messageRow.id, emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  useEffect(() => {
    activeChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    channelMembersRef.current = channelMembers;
  }, [channelMembers]);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspace = async () => {
      await fetchEmployees();
      const channelRows = await fetchChannels({ keepSelection: false });
      if (!cancelled && channelRows.length) {
        setNotice("");
      }
    };

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [profile.company_id]);

  useEffect(() => {
    if (!selectedChannelId) {
      setMessages([]);
      setReactions([]);
      return undefined;
    }

    fetchMessages(selectedChannelId);
    markChannelRead(selectedChannelId);
    setThreadMessageId("");
    setMessageText("");
    setThreadMessageText("");
    setMainAttachment(null);
    setThreadAttachment(null);
    setTypingUsers([]);

    const messageChannel = supabase
      .channel(`messages-${selectedChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${selectedChannelId}`,
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const nextMessages = messagesRef.current.filter((item) => item.id !== payload.old.id);
            setMessages(nextMessages);
            await fetchReactions(selectedChannelId, nextMessages);
            return;
          }

          const fullMessage = await fetchMessageById(payload.new.id);
          if (!fullMessage) return;

          setMessages((current) =>
            payload.eventType === "UPDATE"
              ? current.map((item) => (item.id === fullMessage.id ? fullMessage : item))
              : upsertById(current, fullMessage),
          );

          await fetchReactions(selectedChannelId);
          scrollToBottom(messageListRef);

          if (fullMessage.sender_id !== profile.id && activeChannelIdRef.current === selectedChannelId) {
            await markChannelRead(selectedChannelId);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        async (payload) => {
          const reactionMessageId = payload.new?.message_id ?? payload.old?.message_id;
          if (messagesRef.current.some((messageRow) => messageRow.id === reactionMessageId)) {
            await fetchReactions(selectedChannelId);
          }
        },
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`typing-${selectedChannelId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.user_id === profile.id) return;

        setTypingUsers((current) => Array.from(new Set([...current, payload.user_name])));

        window.clearTimeout(typingTimeoutsRef.current[payload.user_id]);
        typingTimeoutsRef.current[payload.user_id] = window.setTimeout(() => {
          setTypingUsers((current) => current.filter((name) => name !== payload.user_name));
          delete typingTimeoutsRef.current[payload.user_id];
        }, TYPING_VISIBLE_MS);
      })
      .subscribe();

    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
      Object.values(typingTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
      typingTimeoutsRef.current = {};
    };
  }, [profile.id, selectedChannelId, supabase]);

  useEffect(() => {
    const workspaceChannel = supabase
      .channel(`chat-workspace-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channels",
          filter: `company_id=eq.${profile.company_id}`,
        },
        async () => {
          await fetchChannels();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_members",
        },
        async () => {
          await fetchChannels();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `company_id=eq.${profile.company_id}`,
        },
        async () => {
          await fetchUnreadCounts(channelsRef.current, channelMembersRef.current);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(workspaceChannel);
    };
  }, [profile.company_id, profile.id, supabase]);

  useEffect(() => {
    const presenceChannel = supabase
      .channel("online-users")
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const onlineIds = Object.values(state)
          .flat()
          .map((entry) => entry.user_id);
        setOnlineUsers(Array.from(new Set(onlineIds)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user_id: profile.id });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [profile.id, supabase]);

  useEffect(() => {
    if (messages.length) {
      scrollToBottom(messageListRef);
    }
  }, [messages.length]);

  useEffect(() => {
    if (threadReplies.length || threadParent) {
      scrollToBottom(threadListRef);
    }
  }, [threadParent, threadReplies.length]);

  useEffect(() => {
    if (!threadParent && threadMessageId) {
      setThreadMessageId("");
    }
  }, [threadMessageId, threadParent]);

  return (
    <section className="chat-page">
      {!!error && <div className="alert error">{error}</div>}
      {!!notice && <div className="alert success">{notice}</div>}

      <div className="chat-shell panel">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-top">
            <div className="chat-sidebar-brand">
              <h2>Cliq</h2>
              <p>Company chat</p>
            </div>
            <input
              type="search"
              className="chat-search-input"
              placeholder="Search channels or people"
              value={channelSearch}
              onChange={(event) => setChannelSearch(event.target.value)}
            />
          </div>

          <div className="chat-sidebar-section">
            <div className="chat-section-row">
              <span className="sidebar-section-label">CHANNELS</span>
              {canManageChannels ? (
                <button
                  type="button"
                  className="chat-plus-button"
                  onClick={() => {
                    setCreateChannelForm({
                      name: "",
                      description: "",
                      type: "public",
                      members: [],
                    });
                    setShowCreateChannelModal(true);
                  }}
                >
                  +
                </button>
              ) : null}
            </div>

            <div className="chat-sidebar-list">
              {filteredChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  className={`chat-channel-item${channel.id === selectedChannelId ? " active" : ""}`}
                  onClick={() => setSelectedChannelId(channel.id)}
                >
                  <span className="chat-channel-label">
                    <span className="chat-channel-prefix">{channel.type === "private" ? "lock" : "#"}</span>
                    <span className={unreadByChannel[channel.id] ? "chat-channel-strong" : ""}>{channel.displayName}</span>
                  </span>
                  {unreadByChannel[channel.id] ? <span className="chat-unread-badge">{unreadByChannel[channel.id]}</span> : null}
                </button>
              ))}
              {!filteredChannels.length ? <div className="chat-empty-mini">No channels found.</div> : null}
            </div>
          </div>

          <div className="chat-sidebar-section chat-sidebar-grow">
            <div className="chat-section-row">
              <span className="sidebar-section-label">DIRECT MESSAGES</span>
            </div>

            <div className="chat-sidebar-list">
              {filteredEmployees.map((employee) => {
                const directName = createDirectChannelName(profile.id, employee.id);
                const active =
                  selectedChannel?.type === "direct" &&
                  (selectedChannel.name === directName ||
                    (selectedChannel.name.includes(profile.id) && selectedChannel.name.includes(employee.id)));

                return (
                  <button
                    key={employee.id}
                    type="button"
                    className={`chat-dm-item${active ? " active" : ""}`}
                    onClick={() => openDM(employee)}
                  >
                    <span className="chat-dm-copy">
                      <span
                        className="chat-avatar small"
                        style={{
                          background: `${getAvatarColor(employee.name)}20`,
                          color: getAvatarColor(employee.name),
                        }}
                      >
                        {getInitials(employee.name)}
                      </span>
                      <span className="chat-dm-text">
                        <strong>{employee.name}</strong>
                        <small>{employee.department || employee.email}</small>
                      </span>
                    </span>
                    <span className={`chat-status-dot${onlineUsers.includes(employee.id) ? " online" : ""}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="chat-main">
          <header className="chat-main-header">
            <div>
              <h2>{selectedChannel ? (selectedChannel.type === "direct" ? selectedChannel.displayName : `# ${selectedChannel.displayName}`) : "Chat"}</h2>
              <p>
                {selectedChannel?.descriptionLabel || "Select a channel to start chatting."}
                {selectedChannel ? ` | ${selectedChannel.memberCount} members` : ""}
              </p>
            </div>

            <div className="chat-header-actions">
              <button type="button" className="ghost-button" onClick={() => setShowMessageSearch((current) => !current)}>
                Search Messages
              </button>
            </div>
          </header>

          {showMessageSearch ? (
            <div className="chat-search-bar">
              <input
                type="search"
                placeholder="Search in this conversation"
                value={messageSearch}
                onChange={(event) => setMessageSearch(event.target.value)}
              />
            </div>
          ) : null}

          <div className="chat-message-list" ref={messageListRef}>
            {loadingWorkspace || loadingMessages ? <div className="empty-state">Loading chat...</div> : null}
            {!loadingWorkspace && !loadingMessages && !selectedChannel ? <div className="empty-state">Select a channel to begin.</div> : null}
            {!loadingWorkspace && !loadingMessages && selectedChannel && !visibleMessages.length ? (
              <div className="empty-state">No messages yet. Start the conversation.</div>
            ) : null}

            {!loadingWorkspace &&
              !loadingMessages &&
              visibleMessages.map((messageRow, index) => {
                const previousMessage = visibleMessages[index - 1];
                const showDateDivider =
                  !previousMessage ||
                  new Date(previousMessage.created_at).toDateString() !== new Date(messageRow.created_at).toDateString();

                return (
                  <div key={messageRow.id}>
                    {showDateDivider ? (
                      <div className="chat-date-divider">
                        <span>{formatDayDividerLabel(messageRow.created_at)}</span>
                      </div>
                    ) : null}

                    {firstUnreadMessageId === messageRow.id ? (
                      <div className="chat-unread-divider">
                        <span>New Messages</span>
                      </div>
                    ) : null}

                    {renderMessage(messageRow, previousMessage, messageSearch)}
                  </div>
                );
              })}
          </div>

          <div className="chat-composer">
            {typingUsers.length ? (
              <div className="chat-typing-indicator">
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
              </div>
            ) : null}

            {mainAttachment ? (
              <div className="chat-attachment-pill">
                <span>{mainAttachment.file.name}</span>
                <button type="button" onClick={() => setMainAttachment(null)}>
                  Remove
                </button>
              </div>
            ) : null}

            <div className="chat-composer-row">
              <button type="button" className="icon-button" onClick={() => mainFileInputRef.current?.click()}>
                <span aria-hidden="true">{"\u{1F4CE}"}</span>
              </button>
              <button type="button" className="icon-button" onClick={() => setMessageText((current) => `${current}\u{1F642}`)}>
                <span aria-hidden="true">{"\u{1F60A}"}</span>
              </button>
              <textarea
                value={messageText}
                placeholder={selectedChannel ? `Message ${selectedChannel.type === "direct" ? selectedChannel.displayName : `#${selectedChannel.displayName}`}` : "Select a channel first"}
                onChange={handleMainComposerChange}
                onKeyDown={handleMessageKeyDown}
                disabled={!selectedChannel || sending}
              />
              <button
                type="button"
                className="primary-button"
                disabled={!selectedChannel || sending}
                onClick={async () =>
                  sendMessage({
                    text: messageText,
                    attachment: mainAttachment,
                    onReset: () => {
                      setMessageText("");
                      setMainAttachment(null);
                    },
                  })
                }
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>

            <input
              ref={mainFileInputRef}
              hidden
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setMainAttachment({ file });
                event.target.value = "";
              }}
            />
          </div>
        </div>

        <aside className={`chat-thread${threadMessageId ? " open" : ""}`}>
          <div className="chat-thread-header">
            <div>
              <h3>Thread</h3>
              <p>{threadReplies.length} replies</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setThreadMessageId("")}>
              <Icon name="close" />
            </button>
          </div>

          {threadParent ? (
            <>
              <div className="chat-thread-body" ref={threadListRef}>
                <div className="chat-thread-origin">{renderMessage(threadParent, null, messageSearch, true)}</div>
                {threadReplies.map((reply, index) => renderMessage(reply, threadReplies[index - 1] ?? threadParent, messageSearch, true))}
              </div>

              <div className="chat-composer thread">
                {threadAttachment ? (
                  <div className="chat-attachment-pill">
                    <span>{threadAttachment.file.name}</span>
                    <button type="button" onClick={() => setThreadAttachment(null)}>
                      Remove
                    </button>
                  </div>
                ) : null}

                <div className="chat-composer-row">
                  <button type="button" className="icon-button" onClick={() => threadFileInputRef.current?.click()}>
                    <span aria-hidden="true">{"\u{1F4CE}"}</span>
                  </button>
                  <textarea
                    value={threadMessageText}
                    placeholder="Reply in thread"
                    onChange={handleThreadComposerChange}
                    onKeyDown={handleThreadKeyDown}
                    disabled={sending}
                  />
                  <button
                    type="button"
                    className="primary-button"
                    disabled={sending}
                    onClick={async () =>
                      sendMessage({
                        text: threadMessageText,
                        attachment: threadAttachment,
                        replyTo: threadMessageId,
                        onReset: () => {
                          setThreadMessageText("");
                          setThreadAttachment(null);
                        },
                      })
                    }
                  >
                    Reply
                  </button>
                </div>

                <input
                  ref={threadFileInputRef}
                  hidden
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setThreadAttachment({ file });
                    event.target.value = "";
                  }}
                />
              </div>
            </>
          ) : (
            <div className="empty-state">Open a thread to see replies here.</div>
          )}
        </aside>
      </div>

      {showCreateChannelModal ? (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <div className="modal-header">
              <div>
                <h2>Create Channel</h2>
                <p>Add a new chat space for your team.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowCreateChannelModal(false)}>
                <Icon name="close" />
              </button>
            </div>

            <div className="modal-body">
              <div className="stack">
                <label className="field">
                  <span>Channel name</span>
                  <input
                    value={createChannelForm.name}
                    onChange={(event) =>
                      setCreateChannelForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="project-alpha"
                  />
                </label>

                <label className="field">
                  <span>Description</span>
                  <textarea
                    value={createChannelForm.description}
                    onChange={(event) =>
                      setCreateChannelForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="What is this channel for?"
                  />
                </label>

                <label className="field">
                  <span>Channel type</span>
                  <select
                    value={createChannelForm.type}
                    onChange={(event) =>
                      setCreateChannelForm((current) => ({
                        ...current,
                        type: event.target.value,
                        members: event.target.value === "public" ? [] : current.members,
                      }))
                    }
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </label>

                {createChannelForm.type === "private" ? (
                  <div className="field">
                    <span>Members</span>
                    <div className="chat-member-picker">
                      {employees.map((employee) => (
                        <label key={employee.id} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={employee.id === profile.id || createChannelForm.members.includes(employee.id)}
                            disabled={employee.id === profile.id}
                            onChange={(event) =>
                              setCreateChannelForm((current) => ({
                                ...current,
                                members: event.target.checked
                                  ? [...current.members, employee.id]
                                  : current.members.filter((userId) => userId !== employee.id),
                              }))
                            }
                          />
                          {employee.name} | {employee.department || employee.email}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="chat-member-note">All employees will be added automatically to public channels.</div>
                )}
              </div>

              <div className="row-end" style={{ marginTop: 20 }}>
                <button type="button" className="ghost-button" onClick={() => setShowCreateChannelModal(false)}>
                  Cancel
                </button>
                <button type="button" className="primary-button" onClick={createChannel}>
                  Create Channel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
