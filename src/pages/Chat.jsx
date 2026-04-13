import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Icon } from "../brand";
import { formatDate, formatTime } from "../utils";

const EMOJI_OPTIONS = ["👍", "❤️", "🔥", "😂", "👏", "🎉"];

function getInitials(name) {
  if (!name) return "U";
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getAvatarColor(seed = "") {
  const palette = ["#f59e0b", "#10b981", "#3b82f6", "#6366f1", "#ef4444", "#0f766e"];
  const value = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[value % palette.length];
}

function isImage(fileType = "", fileUrl = "") {
  return fileType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileUrl);
}

function createDirectChannelName(userId, targetUserId) {
  return `dm:${[userId, targetUserId].sort().join(":")}`;
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

function upsertRow(rows, nextRow) {
  const filtered = rows.filter((item) => item.id !== nextRow.id);
  return [...filtered, nextRow].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
}

function buildUnreadMap(messages, memberships, currentUserId) {
  const lastReadMap = memberships.reduce((accumulator, membership) => {
    accumulator[membership.channel_id] = membership.last_read_at ? new Date(membership.last_read_at).getTime() : 0;
    return accumulator;
  }, {});

  return messages.reduce((accumulator, message) => {
    const createdAt = message.created_at ? new Date(message.created_at).getTime() : 0;
    const lastReadAt = lastReadMap[message.channel_id] ?? 0;
    if (message.sender_id !== currentUserId && createdAt > lastReadAt) {
      accumulator[message.channel_id] = (accumulator[message.channel_id] ?? 0) + 1;
    }
    return accumulator;
  }, {});
}

export default function Chat() {
  const { supabase, profile, refreshChatUnreadCount } = useOutletContext();
  const [employees, setEmployees] = useState([]);
  const [channels, setChannels] = useState([]);
  const [channelMembers, setChannelMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState("");
  const [threadMessageId, setThreadMessageId] = useState("");
  const [channelQuery, setChannelQuery] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [threadComposerValue, setThreadComposerValue] = useState("");
  const [mainAttachment, setMainAttachment] = useState(null);
  const [threadAttachment, setThreadAttachment] = useState(null);
  const [reactionTargetId, setReactionTargetId] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [onlineUsers, setOnlineUsers] = useState({});
  const [presenceStatus, setPresenceStatus] = useState("online");
  const [memberManagerChannelId, setMemberManagerChannelId] = useState("");
  const [memberSelection, setMemberSelection] = useState([]);
  const fileInputRef = useRef(null);
  const threadFileInputRef = useRef(null);
  const messageListRef = useRef(null);

  const canManageChannels = profile.role === "admin" || profile.role === "hr";
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

  const unreadByChannel = useMemo(
    () => buildUnreadMap(messages, channelMembers.filter((item) => item.user_id === profile.id), profile.id),
    [channelMembers, messages, profile.id],
  );

  const channelsWithMeta = useMemo(
    () =>
      channels.map((channel) => {
        const members = membershipsByChannel[channel.id] ?? [];
        const directPartner = channel.type === "direct"
          ? members
              .map((member) => employeesById[member.user_id])
              .find((employee) => employee && employee.id !== profile.id)
          : null;

        return {
          ...channel,
          memberCount: members.length,
          members,
          displayName: channel.type === "direct" ? directPartner?.name ?? "Direct Message" : `# ${channel.name}`,
          shortName: channel.type === "direct" ? directPartner?.name ?? "DM" : channel.name,
          descriptionLabel:
            channel.type === "direct"
              ? directPartner?.department
                ? `${directPartner.department} direct messages`
                : "Direct messages"
              : channel.description || "No channel description yet.",
          directPartner,
        };
      }),
    [channels, employeesById, membershipsByChannel, profile.id],
  );

  const filteredPublicChannels = useMemo(
    () =>
      channelsWithMeta.filter(
        (channel) =>
          channel.type !== "direct" &&
          `${channel.name} ${channel.description ?? ""}`.toLowerCase().includes(channelQuery.trim().toLowerCase()),
      ),
    [channelQuery, channelsWithMeta],
  );

  const filteredEmployees = useMemo(
    () =>
      employees.filter((employee) => {
        if (employee.id === profile.id) return false;
        const haystack = `${employee.name} ${employee.email} ${employee.department}`.toLowerCase();
        return haystack.includes(channelQuery.trim().toLowerCase());
      }),
    [channelQuery, employees, profile.id],
  );

  const activeChannel = useMemo(
    () => channelsWithMeta.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channelsWithMeta],
  );

  const activeChannelMessages = useMemo(
    () =>
      messages
        .filter((item) => item.channel_id === activeChannelId)
        .sort((left, right) => new Date(left.created_at) - new Date(right.created_at)),
    [activeChannelId, messages],
  );

  const topLevelMessages = useMemo(() => activeChannelMessages.filter((item) => !item.reply_to), [activeChannelMessages]);
  const threadParent = useMemo(
    () => activeChannelMessages.find((item) => item.id === threadMessageId) ?? null,
    [activeChannelMessages, threadMessageId],
  );
  const threadReplies = useMemo(
    () =>
      activeChannelMessages
        .filter((item) => item.reply_to === threadMessageId)
        .sort((left, right) => new Date(left.created_at) - new Date(right.created_at)),
    [activeChannelMessages, threadMessageId],
  );

  const visibleMessages = useMemo(() => {
    if (!messageQuery.trim()) return topLevelMessages;
    const query = messageQuery.trim().toLowerCase();
    return topLevelMessages.filter((item) => {
      const ownMatch = (item.content ?? "").toLowerCase().includes(query);
      const replyMatch = activeChannelMessages.some(
        (reply) => reply.reply_to === item.id && (reply.content ?? "").toLowerCase().includes(query),
      );
      return ownMatch || replyMatch;
    });
  }, [activeChannelMessages, messageQuery, topLevelMessages]);

  const firstUnreadMessageId = useMemo(() => {
    const membership = channelMembers.find((item) => item.channel_id === activeChannelId && item.user_id === profile.id);
    const lastReadAt = membership?.last_read_at ? new Date(membership.last_read_at).getTime() : 0;
    return visibleMessages.find(
      (item) => item.sender_id !== profile.id && new Date(item.created_at).getTime() > lastReadAt,
    )?.id;
  }, [activeChannelId, channelMembers, profile.id, visibleMessages]);

  const loadWorkspace = async ({ keepSelection = true } = {}) => {
    setLoading(true);
    setError("");

    const [employeesResponse, channelsResponse, membersResponse, messagesResponse] = await Promise.all([
      supabase.from("users").select("id, name, email, department, role, profile_photo_url, is_active").eq("company_id", profile.company_id).order("name"),
      supabase.from("channels").select("*").eq("company_id", profile.company_id).order("created_at"),
      supabase.from("channel_members").select("*").order("created_at"),
      supabase.from("messages").select("*").eq("company_id", profile.company_id).order("created_at"),
    ]);

    if (employeesResponse.error || channelsResponse.error || membersResponse.error || messagesResponse.error) {
      setError(
        employeesResponse.error?.message ||
          channelsResponse.error?.message ||
          membersResponse.error?.message ||
          messagesResponse.error?.message ||
          "Unable to load chat workspace.",
      );
      setLoading(false);
      return;
    }

    const messageIds = (messagesResponse.data ?? []).map((item) => item.id);
    let reactionRows = [];
    if (messageIds.length) {
      const reactionsResponse = await supabase
        .from("message_reactions")
        .select("*")
        .in("message_id", messageIds)
        .order("created_at");

      if (reactionsResponse.error) {
        setError(reactionsResponse.error.message);
      } else {
        reactionRows = reactionsResponse.data ?? [];
      }
    }

    const nextEmployees = employeesResponse.data ?? [];
    const nextChannels = channelsResponse.data ?? [];
    const nextMembers = membersResponse.data ?? [];
    const nextMessages = messagesResponse.data ?? [];

    setEmployees(nextEmployees);
    setChannels(nextChannels);
    setChannelMembers(nextMembers);
    setMessages(nextMessages);
    setReactions(reactionRows);

    if (!keepSelection || !nextChannels.some((channel) => channel.id === activeChannelId)) {
      const fallbackChannel =
        nextChannels.find((channel) => channel.type === "public" && channel.name === "general") ?? nextChannels[0] ?? null;
      setActiveChannelId(fallbackChannel?.id ?? "");
    }

    setLoading(false);
    refreshChatUnreadCount?.();
  };

  const loadReactionsForActiveChannel = async (channelId) => {
    const messageIds = messages.filter((item) => item.channel_id === channelId).map((item) => item.id);
    if (!messageIds.length) return;

    const { data, error: reactionsError } = await supabase
      .from("message_reactions")
      .select("*")
      .in("message_id", messageIds)
      .order("created_at");

    if (!reactionsError) {
      setReactions((current) => {
        const otherReactions = current.filter((item) => !messageIds.includes(item.message_id));
        return [...otherReactions, ...(data ?? [])];
      });
    }
  };

  const markChannelRead = async (channelId) => {
    if (!channelId) return;
    const timestamp = new Date().toISOString();
    const { error: upsertError } = await supabase.from("channel_members").upsert(
      {
        channel_id: channelId,
        user_id: profile.id,
        last_read_at: timestamp,
      },
      { onConflict: "channel_id,user_id" },
    );

    if (!upsertError) {
      setChannelMembers((current) => {
        const existing = current.find((item) => item.channel_id === channelId && item.user_id === profile.id);
        if (existing) {
          return current.map((item) =>
            item.channel_id === channelId && item.user_id === profile.id ? { ...item, last_read_at: timestamp } : item,
          );
        }
        return [
          ...current,
          {
            id: `${channelId}-${profile.id}`,
            channel_id: channelId,
            user_id: profile.id,
            last_read_at: timestamp,
            created_at: timestamp,
          },
        ];
      });
      refreshChatUnreadCount?.();
    }
  };

  const uploadAttachment = async (file) => {
    if (!file) return { fileUrl: null, fileType: null };
    const filePath = `${profile.company_id}/${profile.id}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { error: uploadError } = await supabase.storage.from("chat-files").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("chat-files").getPublicUrl(filePath);
    return { fileUrl: data.publicUrl, fileType: file.type || null };
  };

  const sendMessage = async ({ content, attachment, replyTo = null, reset }) => {
    if (!activeChannel) return;
    const trimmedContent = content.trim();
    if (!trimmedContent && !attachment?.file) return;

    setSaving(true);
    setError("");

    try {
      const upload = await uploadAttachment(attachment?.file ?? null);
      const { error: insertError } = await supabase.from("messages").insert({
        channel_id: activeChannel.id,
        company_id: profile.company_id,
        sender_id: profile.id,
        content: trimmedContent || null,
        file_url: upload.fileUrl,
        file_type: upload.fileType,
        reply_to: replyTo,
      });

      if (insertError) throw insertError;
      reset();
      setMessage("");
      await markChannelRead(activeChannel.id);
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleReaction = async (messageId, emoji) => {
    const existingReaction = reactions.find(
      (item) => item.message_id === messageId && item.user_id === profile.id && item.emoji === emoji,
    );
    if (existingReaction) {
      await supabase.from("message_reactions").delete().eq("id", existingReaction.id);
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: profile.id,
        emoji,
      });
    }
    setReactionTargetId("");
  };

  const handleEditSave = async (messageId) => {
    const nextValue = editingValue.trim();
    if (!nextValue) return;
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

  const handleDeleteMessage = async (messageId) => {
    const confirmed = window.confirm("Delete this message?");
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from("messages").delete().eq("id", messageId);
    if (deleteError) setError(deleteError.message);
  };

  const handlePinToggle = async (chatMessage) => {
    const { error: updateError } = await supabase
      .from("messages")
      .update({ is_pinned: !chatMessage.is_pinned })
      .eq("id", chatMessage.id);
    if (updateError) setError(updateError.message);
  };

  const createChannel = async () => {
    if (!canManageChannels) return;
    const name = window.prompt("Channel name");
    if (!name?.trim()) return;
    const type = window.prompt("Type: public or private", "public")?.trim().toLowerCase() || "public";
    if (!["public", "private"].includes(type)) {
      setError("Choose either public or private.");
      return;
    }
    const description = window.prompt("Description", "") ?? "";
    const { data, error: insertError } = await supabase
      .from("channels")
      .insert({
        company_id: profile.company_id,
        name: name.trim().toLowerCase().replace(/\s+/g, "-"),
        description: description.trim() || null,
        type,
        created_by: profile.id,
      })
      .select("*")
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (type === "public") {
      const members = employees.map((employee) => ({ channel_id: data.id, user_id: employee.id }));
      if (members.length) {
        await supabase.from("channel_members").upsert(members, { onConflict: "channel_id,user_id" });
      }
    } else {
      await supabase.from("channel_members").upsert(
        [{ channel_id: data.id, user_id: profile.id }],
        { onConflict: "channel_id,user_id" },
      );
    }

    setMessage("Channel created.");
    await loadWorkspace({ keepSelection: false });
    setActiveChannelId(data.id);
    if (type === "private") {
      openMemberManager(data.id);
    }
  };

  const openDirectMessage = async (employee) => {
    const directName = createDirectChannelName(profile.id, employee.id);
    const existing = channels.find((channel) => channel.type === "direct" && channel.name === directName);
    if (existing) {
      setActiveChannelId(existing.id);
      return;
    }

    const { data: channelRow, error: channelError } = await supabase
      .from("channels")
      .insert({
        company_id: profile.company_id,
        name: directName,
        description: `Direct conversation between ${profile.name} and ${employee.name}`,
        type: "direct",
        created_by: profile.id,
      })
      .select("*")
      .single();

    if (channelError) {
      setError(channelError.message);
      return;
    }

    const { error: membershipError } = await supabase.from("channel_members").upsert(
      [
        { channel_id: channelRow.id, user_id: profile.id },
        { channel_id: channelRow.id, user_id: employee.id },
      ],
      { onConflict: "channel_id,user_id" },
    );

    if (membershipError) {
      setError(membershipError.message);
      return;
    }

    await loadWorkspace({ keepSelection: false });
    setActiveChannelId(channelRow.id);
  };

  const openMemberManager = (channelId) => {
    const existingMembers = (membershipsByChannel[channelId] ?? []).map((item) => item.user_id);
    setMemberSelection(existingMembers);
    setMemberManagerChannelId(channelId);
  };

  const saveMemberSelection = async () => {
    const currentMembers = membershipsByChannel[memberManagerChannelId] ?? [];
    const currentIds = currentMembers.map((item) => item.user_id);
    const selectedIds = Array.from(new Set(memberSelection));
    const toInsert = selectedIds
      .filter((userId) => !currentIds.includes(userId))
      .map((userId) => ({ channel_id: memberManagerChannelId, user_id: userId }));
    const toDelete = currentMembers.filter((item) => !selectedIds.includes(item.user_id));

    if (toInsert.length) {
      const { error: insertError } = await supabase.from("channel_members").upsert(toInsert, {
        onConflict: "channel_id,user_id",
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
    }

    for (const member of toDelete) {
      const { error: deleteError } = await supabase
        .from("channel_members")
        .delete()
        .eq("channel_id", member.channel_id)
        .eq("user_id", member.user_id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
    }

    setMemberManagerChannelId("");
    setMessage("Channel members updated.");
    await loadWorkspace();
  };

  useEffect(() => {
    loadWorkspace({ keepSelection: false });
  }, [profile.company_id]);

  useEffect(() => {
    if (!activeChannelId) return;
    markChannelRead(activeChannelId);
  }, [activeChannelId]);

  useEffect(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [activeChannelMessages.length, threadMessageId]);

  useEffect(() => {
    if (!activeChannelId) return undefined;

    const roomChannel = supabase
      .channel(`chat-room-${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((current) => upsertRow(current, payload.new));
          }
          if (payload.eventType === "UPDATE") {
            setMessages((current) => current.map((item) => (item.id === payload.new.id ? payload.new : item)));
          }
          if (payload.eventType === "DELETE") {
            setMessages((current) => current.filter((item) => item.id !== payload.old.id));
          }
          refreshChatUnreadCount?.();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
    };
  }, [activeChannelId, refreshChatUnreadCount, supabase]);

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
        () => {
          loadWorkspace();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_members",
        },
        () => {
          loadWorkspace();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `company_id=eq.${profile.company_id}`,
        },
        (payload) => {
          const incomingChannel = channelsWithMeta.find((channel) => channel.id === payload.new.channel_id);
          if (!incomingChannel || payload.new.sender_id === profile.id) return;

          if (incomingChannel.type === "direct" && typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "default") {
              Notification.requestPermission();
            } else if (Notification.permission === "granted") {
              const senderName = employeesById[payload.new.sender_id]?.name ?? "New message";
              new Notification(senderName, {
                body: payload.new.content ?? "Sent an attachment",
              });
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(workspaceChannel);
    };
  }, [channelsWithMeta, employeesById, profile.company_id, profile.id, supabase]);

  useEffect(() => {
    loadReactionsForActiveChannel(activeChannelId);
  }, [activeChannelId, messages]);

  useEffect(() => {
    const presenceChannel = supabase.channel("online-users", {
      config: {
        presence: {
          key: profile.id,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const nextUsers = Object.entries(state).reduce((accumulator, [userId, entries]) => {
          const latest = entries[entries.length - 1];
          accumulator[userId] = latest?.status ?? "offline";
          return accumulator;
        }, {});
        setOnlineUsers(nextUsers);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: profile.id,
            status: presenceStatus,
            last_seen_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [presenceStatus, profile.id, supabase]);

  const handleComposerSubmit = async (event) => {
    event.preventDefault();
    await sendMessage({
      content: composerValue,
      attachment: mainAttachment,
      reset: () => {
        setComposerValue("");
        setMainAttachment(null);
      },
    });
  };

  const handleThreadSubmit = async (event) => {
    event.preventDefault();
    await sendMessage({
      content: threadComposerValue,
      attachment: threadAttachment,
      replyTo: threadMessageId,
      reset: () => {
        setThreadComposerValue("");
        setThreadAttachment(null);
      },
    });
  };

  const reactionMap = reactions.reduce((accumulator, item) => {
    if (!accumulator[item.message_id]) {
      accumulator[item.message_id] = [];
    }
    accumulator[item.message_id].push(item);
    return accumulator;
  }, {});

  const renderAttachment = (chatMessage) => {
    if (!chatMessage.file_url) return null;
    if (isImage(chatMessage.file_type ?? "", chatMessage.file_url)) {
      return (
        <a href={chatMessage.file_url} target="_blank" rel="noreferrer" className="chat-attachment-card">
          <img src={chatMessage.file_url} alt="Chat attachment" className="chat-image-preview" />
        </a>
      );
    }
    return (
      <a href={chatMessage.file_url} target="_blank" rel="noreferrer" className="chat-attachment-card">
        <Icon name="report" />
        <span>{chatMessage.file_type || "Attachment"}</span>
      </a>
    );
  };

  const renderMessageItem = (chatMessage, previousMessage, query) => {
    const sender = employeesById[chatMessage.sender_id];
    const reactionsForMessage = reactionMap[chatMessage.id] ?? [];
    const grouped =
      previousMessage &&
      previousMessage.sender_id === chatMessage.sender_id &&
      formatDate(previousMessage.created_at) === formatDate(chatMessage.created_at) &&
      Math.abs(new Date(chatMessage.created_at) - new Date(previousMessage.created_at)) < 5 * 60 * 1000;
    const isOwn = chatMessage.sender_id === profile.id;
    const canEdit = isOwn;
    const canDelete = isOwn || canManageChannels;

    return (
      <div key={chatMessage.id}>
        {firstUnreadMessageId === chatMessage.id ? (
          <div className="chat-unread-divider">
            <span>Unread messages</span>
          </div>
        ) : null}
        <article className={`chat-message-row${isOwn ? " own" : ""}${grouped ? " grouped" : ""}`}>
          {!grouped ? (
            <div
              className="chat-avatar"
              style={{
                background: `${getAvatarColor(sender?.name ?? chatMessage.sender_id)}20`,
                color: getAvatarColor(sender?.name ?? chatMessage.sender_id),
              }}
            >
              {getInitials(sender?.name)}
            </div>
          ) : (
            <div className="chat-avatar chat-avatar-spacer" />
          )}
          <div className={`chat-message-card${isOwn ? " own" : ""}`}>
            {!grouped ? (
              <div className="chat-message-meta">
                <strong>{sender?.name ?? "Unknown sender"}</strong>
                <span>{formatTime(chatMessage.created_at)}</span>
              </div>
            ) : (
              <div className="chat-message-meta compact">
                <span>{formatTime(chatMessage.created_at)}</span>
              </div>
            )}
            {chatMessage.is_pinned ? <div className="chat-pinned-label">Pinned</div> : null}
            {editingMessageId === chatMessage.id ? (
              <div className="chat-edit-box">
                <textarea value={editingValue} onChange={(event) => setEditingValue(event.target.value)} />
                <div className="row-end">
                  <button type="button" className="ghost-button" onClick={() => setEditingMessageId("")}>
                    Cancel
                  </button>
                  <button type="button" className="primary-button" onClick={() => handleEditSave(chatMessage.id)}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                {chatMessage.content ? <p className="chat-message-text">{highlightContent(chatMessage.content, query)}</p> : null}
                {renderAttachment(chatMessage)}
                {chatMessage.edited_at ? <span className="chat-edited-label">edited</span> : null}
              </>
            )}
            {reactionsForMessage.length ? (
              <div className="chat-reaction-row">
                {Object.entries(
                  reactionsForMessage.reduce((accumulator, item) => {
                    accumulator[item.emoji] = accumulator[item.emoji] ?? [];
                    accumulator[item.emoji].push(item);
                    return accumulator;
                  }, {}),
                ).map(([emoji, items]) => (
                  <button
                    key={`${chatMessage.id}-${emoji}`}
                    type="button"
                    className={`chat-reaction-chip${items.some((item) => item.user_id === profile.id) ? " active" : ""}`}
                    onClick={() => toggleReaction(chatMessage.id, emoji)}
                  >
                    <span>{emoji}</span>
                    <span>{items.length}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="chat-message-actions">
              <button type="button" className="chat-action-button" onClick={() => setReactionTargetId(chatMessage.id)}>
                React
              </button>
              <button type="button" className="chat-action-button" onClick={() => setThreadMessageId(chatMessage.id)}>
                Reply
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="chat-action-button"
                  onClick={() => {
                    setEditingMessageId(chatMessage.id);
                    setEditingValue(chatMessage.content ?? "");
                  }}
                >
                  Edit
                </button>
              ) : null}
              {canManageChannels ? (
                <button type="button" className="chat-action-button" onClick={() => handlePinToggle(chatMessage)}>
                  {chatMessage.is_pinned ? "Unpin" : "Pin"}
                </button>
              ) : null}
              {canDelete ? (
                <button type="button" className="chat-action-button danger" onClick={() => handleDeleteMessage(chatMessage.id)}>
                  Delete
                </button>
              ) : null}
            </div>
            {reactionTargetId === chatMessage.id ? (
              <div className="chat-emoji-picker">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button key={`${chatMessage.id}-${emoji}`} type="button" onClick={() => toggleReaction(chatMessage.id, emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      </div>
    );
  };

  return (
    <section className="chat-page">
      {!!error && <div className="alert error">{error}</div>}
      {!!message && <div className="alert success">{message}</div>}

      <div className="chat-shell panel">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-header">
            <div>
              <h2>Team Chat</h2>
              <p>Realtime company conversations powered by Supabase.</p>
            </div>
          </div>
          <input
            type="search"
            className="chat-search-input"
            placeholder="Search channels or teammates"
            value={channelQuery}
            onChange={(event) => setChannelQuery(event.target.value)}
          />
          <div className="chat-sidebar-section">
            <div className="chat-section-row">
              <span className="sidebar-section-label">Channels</span>
              {canManageChannels ? (
                <button type="button" className="text-button" onClick={createChannel}>
                  + Add Channel
                </button>
              ) : null}
            </div>
            <div className="chat-sidebar-list">
              {filteredPublicChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  className={`chat-channel-item${channel.id === activeChannelId ? " active" : ""}`}
                  onClick={() => setActiveChannelId(channel.id)}
                >
                  <span>{channel.type === "private" ? "🔒" : "#"} {channel.shortName}</span>
                  {unreadByChannel[channel.id] ? <span className="chat-unread-badge">{unreadByChannel[channel.id]}</span> : null}
                </button>
              ))}
              {!filteredPublicChannels.length ? <div className="chat-empty-mini">No channels match your search.</div> : null}
            </div>
          </div>
          <div className="chat-sidebar-section">
            <div className="chat-section-row">
              <span className="sidebar-section-label">Direct Messages</span>
            </div>
            <div className="chat-sidebar-list">
              {filteredEmployees.map((employee) => {
                const isOnline = onlineUsers[employee.id] === "online";
                return (
                  <button key={employee.id} type="button" className="chat-dm-item" onClick={() => openDirectMessage(employee)}>
                    <span className="chat-dm-copy">
                      <span className="chat-status-dot-wrap">
                        <span className={`chat-status-dot${isOnline ? " online" : ""}`} />
                      </span>
                      <span>
                        <strong>{employee.name}</strong>
                        <small>{employee.department}</small>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="chat-sidebar-footer">
            <div className="chat-user-chip">
              <div
                className="chat-avatar small"
                style={{
                  background: `${getAvatarColor(profile.name)}20`,
                  color: getAvatarColor(profile.name),
                }}
              >
                {getInitials(profile.name)}
              </div>
              <div>
                <strong>{profile.name}</strong>
                <small>{presenceStatus}</small>
              </div>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setPresenceStatus((current) => (current === "online" ? "offline" : "online"))}
            >
              Set {presenceStatus === "online" ? "Offline" : "Online"}
            </button>
          </div>
        </aside>

        <div className="chat-main">
          <header className="chat-main-header">
            <div>
              <h2>{activeChannel?.displayName ?? "Select a chat"}</h2>
              <p>
                {activeChannel?.descriptionLabel ?? "Choose a channel or direct message to start talking."}
                {activeChannel ? `  •  ${activeChannel.memberCount} members` : ""}
              </p>
            </div>
            <div className="chat-header-actions">
              <button type="button" className="ghost-button" onClick={() => setShowMessageSearch((current) => !current)}>
                Search Messages
              </button>
              {canManageChannels && activeChannel?.type === "private" ? (
                <button type="button" className="ghost-button" onClick={() => openMemberManager(activeChannel.id)}>
                  Manage Members
                </button>
              ) : null}
              {canManageChannels && activeChannel?.type !== "direct" ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={async () => {
                    if (!window.confirm(`Delete ${activeChannel.displayName}?`)) return;
                    const { error: deleteError } = await supabase.from("channels").delete().eq("id", activeChannel.id);
                    if (deleteError) {
                      setError(deleteError.message);
                      return;
                    }
                    setThreadMessageId("");
                    setActiveChannelId("");
                    loadWorkspace({ keepSelection: false });
                  }}
                >
                  Delete Channel
                </button>
              ) : null}
            </div>
          </header>

          {showMessageSearch ? (
            <div className="chat-search-bar">
              <input
                type="search"
                placeholder="Search messages in this channel"
                value={messageQuery}
                onChange={(event) => setMessageQuery(event.target.value)}
              />
            </div>
          ) : null}

          <div className="chat-message-list" ref={messageListRef}>
            {loading ? <div className="empty-state">Loading your chat workspace...</div> : null}
            {!loading && !activeChannel ? <div className="empty-state">No channel selected yet.</div> : null}
            {!loading && activeChannel && !visibleMessages.length ? (
              <div className="empty-state">No messages yet in {activeChannel.displayName}. Start the conversation.</div>
            ) : null}
            {!loading &&
              visibleMessages.map((chatMessage, index) => {
                const previousMessage = visibleMessages[index - 1];
                const currentDate = formatDate(chatMessage.created_at);
                const previousDate = previousMessage ? formatDate(previousMessage.created_at) : "";
                const showDateDivider = currentDate !== previousDate;
                return (
                  <div key={chatMessage.id}>
                    {showDateDivider ? (
                      <div className="chat-date-divider">
                        <span>{currentDate}</span>
                      </div>
                    ) : null}
                    {renderMessageItem(chatMessage, previousMessage, messageQuery)}
                  </div>
                );
              })}
          </div>

          <form className="chat-composer" onSubmit={handleComposerSubmit}>
            {mainAttachment ? (
              <div className="chat-attachment-pill">
                <span>{mainAttachment.file.name}</span>
                <button type="button" onClick={() => setMainAttachment(null)}>
                  Remove
                </button>
              </div>
            ) : null}
            <div className="chat-composer-row">
              <button type="button" className="icon-button" onClick={() => fileInputRef.current?.click()}>
                <Icon name="report" />
              </button>
              <button type="button" className="icon-button" onClick={() => setReactionTargetId("composer-emoji")}>
                😊
              </button>
              <textarea
                value={composerValue}
                placeholder={activeChannel ? `Message ${activeChannel.displayName}` : "Select a channel first"}
                onChange={(event) => setComposerValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleComposerSubmit(event);
                  }
                }}
                disabled={!activeChannel}
              />
              <button type="submit" className="primary-button" disabled={!activeChannel || saving}>
                {saving ? "Sending..." : "Send"}
              </button>
            </div>
            {reactionTargetId === "composer-emoji" ? (
              <div className="chat-emoji-picker">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button key={`composer-${emoji}`} type="button" onClick={() => setComposerValue((current) => `${current}${emoji}`)}>
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              hidden
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setMainAttachment({ file });
                event.target.value = "";
              }}
            />
          </form>
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
              <div className="chat-thread-body">
                <div className="chat-thread-origin">{renderMessageItem(threadParent, null, messageQuery)}</div>
                {threadReplies.map((reply, index) => renderMessageItem(reply, threadReplies[index - 1] ?? threadParent, messageQuery))}
              </div>
              <form className="chat-composer thread" onSubmit={handleThreadSubmit}>
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
                    <Icon name="report" />
                  </button>
                  <textarea
                    value={threadComposerValue}
                    placeholder="Reply in thread"
                    onChange={(event) => setThreadComposerValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleThreadSubmit(event);
                      }
                    }}
                  />
                  <button type="submit" className="primary-button" disabled={saving}>
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
              </form>
            </>
          ) : (
            <div className="empty-state">Open a thread from any message to reply here.</div>
          )}
        </aside>
      </div>

      {memberManagerChannelId ? (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <div className="modal-header">
              <div>
                <h2>Manage Private Channel</h2>
                <p>Choose which teammates can access this channel.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setMemberManagerChannelId("")}>
                <Icon name="close" />
              </button>
            </div>
            <div className="modal-body">
              <div className="stack">
                {employees.map((employee) => (
                  <label key={employee.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={memberSelection.includes(employee.id)}
                      onChange={(event) => {
                        setMemberSelection((current) =>
                          event.target.checked
                            ? [...current, employee.id]
                            : current.filter((item) => item !== employee.id),
                        );
                      }}
                    />
                    {employee.name} • {employee.department}
                  </label>
                ))}
              </div>
              <div className="row-end" style={{ marginTop: 20 }}>
                <button type="button" className="ghost-button" onClick={() => setMemberManagerChannelId("")}>
                  Cancel
                </button>
                <button type="button" className="primary-button" onClick={saveMemberSelection}>
                  Save Members
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
