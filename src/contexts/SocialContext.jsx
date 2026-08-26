import { createContext, useContext, useState } from "react";
import { useAuth } from "./AuthContext";

const SocialContext = createContext(null);

function localId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function SocialProvider({ children }) {
  const { firebaseUser, profile } = useAuth();
  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState({});

  function createGroup({ name, description, privacy }) {
    const group = { id: localId("group"), name: name.trim(), description: description.trim(), privacy, ownerId: firebaseUser?.uid ?? "local-user", createdAt: new Date(), channels: [{ id: localId("channel"), name: "geral", type: "TEXT", category: "INFORMAÇÕES", messages: [] }] };
    setGroups((current) => [...current, group]);
    return group;
  }

  function updateGroup(groupId, changes) {
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, ...changes, updatedAt: new Date() } : group));
  }

  function deleteGroup(groupId) {
    setGroups((current) => current.filter((group) => group.id !== groupId));
  }

  function createChannel(groupId, { name, type, category }) {
    const channel = { id: localId("channel"), name: name.trim(), type, category: category.trim() || (type === "VOICE" ? "VOZ" : "SOCIAL"), messages: [] };
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, channels: [...group.channels, channel] } : group));
    return channel;
  }

  function deleteChannel(groupId, channelId) {
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, channels: group.channels.filter((channel) => channel.id !== channelId) } : group));
  }

  function sendChannelMessage(channelId, text) {
    const cleanText = text.trim();
    if (!cleanText) return;
    const message = { id: localId("message"), authorId: firebaseUser?.uid ?? "local-user", authorName: profile?.displayName ?? "Você", text: cleanText, createdAt: new Date(), reactions: [] };
    setGroups((current) => current.map((group) => ({ ...group, channels: group.channels.map((channel) => channel.id === channelId ? { ...channel, messages: [...channel.messages, message] } : channel) })));
  }

  function editChannelMessage(channelId, messageId, text) {
    setGroups((current) => current.map((group) => ({ ...group, channels: group.channels.map((channel) => channel.id === channelId ? { ...channel, messages: channel.messages.map((message) => message.id === messageId ? { ...message, text: text.trim(), edited: true } : message) } : channel) })));
  }

  function deleteChannelMessage(channelId, messageId) {
    setGroups((current) => current.map((group) => ({ ...group, channels: group.channels.map((channel) => channel.id === channelId ? { ...channel, messages: channel.messages.filter((message) => message.id !== messageId) } : channel) })));
  }

  function addFriendRequest(user) {
    if (!user?.uid || user.uid === firebaseUser?.uid) return;
    const request = { ...user, id: localId("request"), status: "pending", createdAt: new Date() };
    setRequests((current) => current.some((item) => item.uid === user.uid) ? current : [...current, request]);
  }

  function acceptRequest(requestId) {
    const request = requests.find((item) => item.id === requestId);
    if (!request) return;
    setRequests((current) => current.filter((item) => item.id !== requestId));
    setFriends((current) => [...current, { ...request, status: "online" }]);
    setNotifications((current) => [{ id: localId("notification"), type: "friend", title: "Nova amizade", text: `${request.displayName} agora está nos seus amigos.`, read: false }, ...current]);
  }

  function rejectRequest(requestId) { setRequests((current) => current.filter((item) => item.id !== requestId)); }
  function removeFriend(uid) { setFriends((current) => current.filter((friend) => friend.uid !== uid)); }
  function blockUser(user) { setBlocked((current) => [...current, user]); removeFriend(user.uid); }
  function unblockUser(uid) { setBlocked((current) => current.filter((user) => user.uid !== uid)); }
  function markNotificationRead(id) { setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item)); }
  function markAllNotificationsRead() { setNotifications((current) => current.map((item) => ({ ...item, read: true }))); }

  function sendLocalMessage(conversationId, text) {
    const cleanText = text.trim();
    if (!cleanText) return;
    const message = { id: localId("dm"), authorId: firebaseUser?.uid ?? "local-user", authorName: profile?.displayName ?? "Você", text: cleanText, createdAt: new Date() };
    setMessages((current) => ({ ...current, [conversationId]: [...(current[conversationId] ?? []), message] }));
  }

  return <SocialContext.Provider value={{ groups, friends, requests, blocked, notifications, messages, createGroup, updateGroup, deleteGroup, createChannel, deleteChannel, sendChannelMessage, editChannelMessage, deleteChannelMessage, addFriendRequest, acceptRequest, rejectRequest, removeFriend, blockUser, unblockUser, markNotificationRead, markAllNotificationsRead, sendLocalMessage }}>
    {children}
  </SocialContext.Provider>;
}

export function useSocial() { return useContext(SocialContext); }
