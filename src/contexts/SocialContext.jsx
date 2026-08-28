import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { acceptFriendRequest, blockUser as blockFirestoreUser, createFriendRequest, isBlocked, rejectFriendRequest, removeFriend, subscribeToBlocks, subscribeToFriendRequests, subscribeToFriends, unblockUser as unblockFirestoreUser } from "../services/friendService";
import { markAllNotificationsRead as markAllFirestoreNotificationsRead, markNotificationRead as markFirestoreNotificationRead, subscribeToNotifications } from "../services/notificationService";
import { createChannel as createFirestoreChannel, createGroup as createFirestoreGroup, deleteChannel as deleteFirestoreChannel, deleteGroup as deleteFirestoreGroup, deleteChannelMessage as deleteFirestoreChannelMessage, editChannelMessage as editFirestoreChannelMessage, inviteToGroup, respondToGroupInvite, sendChannelMessage as sendFirestoreChannelMessage, subscribeToChannelMessages, subscribeToGroupChannels, subscribeToGroupInvites, subscribeToGroups, updateGroup as updateFirestoreGroup } from "../services/communityService";
import { getErrorMessage } from "../utils/errorMessage";

const SocialContext = createContext(null);

export function SocialProvider({ children }) {
  const { firebaseUser, profile } = useAuth();
  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    if (!firebaseUser) return undefined;
    return subscribeToGroups(firebaseUser.uid, setGroups, (snapshotError) => setError(getErrorMessage(snapshotError, "Não foi possível carregar os grupos.")));
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return undefined;
    const unsubscribeBlocks = subscribeToBlocks(firebaseUser.uid, setBlocked, (snapshotError) => setError(getErrorMessage(snapshotError, "Não foi possível carregar os bloqueios.")));
    const unsubscribeNotifications = subscribeToNotifications(firebaseUser.uid, setNotifications, (snapshotError) => setError(getErrorMessage(snapshotError, "Não foi possível carregar as notificações.")));
    const unsubscribeInvites = subscribeToGroupInvites(firebaseUser.uid, setInvites, (snapshotError) => setError(getErrorMessage(snapshotError, "Não foi possível carregar os convites.")));
    return () => { unsubscribeBlocks(); unsubscribeNotifications(); unsubscribeInvites(); };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return undefined;
    const unsubscribeFriends = subscribeToFriends(firebaseUser.uid, setFriends, (snapshotError) => setError(getErrorMessage(snapshotError, "Não foi possível carregar os amigos.")));
    const unsubscribeRequests = subscribeToFriendRequests(firebaseUser.uid, setRequests, (snapshotError) => setError(getErrorMessage(snapshotError, "Não foi possível carregar as solicitações.")));
    return () => { unsubscribeFriends(); unsubscribeRequests(); };
  }, [firebaseUser]);

  useEffect(() => {
    const unsubscribers = [];
    groups.forEach((group) => {
      unsubscribers.push(subscribeToGroupChannels(group.id, (channels) => {
        setGroups((current) => current.map((item) => item.id === group.id ? { ...item, channels: channels ?? [] } : item));
      }, (snapshotError) => setError(getErrorMessage(snapshotError, "Não foi possível carregar os canais."))));
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [groups.map((group) => group.id).join(",")]);

  useEffect(() => {
    const unsubscribers = [];
    groups.forEach((group) => (group.channels ?? []).forEach((channel) => {
      unsubscribers.push(subscribeToChannelMessages(group.id, channel.id, (messages) => {
        setGroups((current) => current.map((item) => item.id === group.id ? { ...item, channels: (item.channels ?? []).map((entry) => entry.id === channel.id ? { ...entry, messages: messages ?? [] } : entry) } : item));
      }, (snapshotError) => setError(getErrorMessage(snapshotError, "Não foi possível carregar as mensagens do canal."))));
    }));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [groups.map((group) => `${group.id}:${(group.channels ?? []).map((channel) => channel.id).join("|")}`).join(",")]);

  async function addFriendRequest(user) {
    if (user?.blockedUid && user?.id) { await unblockFirestoreUser(user.id); return; }
    if (!firebaseUser || !user?.uid || user.uid === firebaseUser.uid) return;
    if (await isBlocked(firebaseUser.uid, user.uid)) throw new Error("Esta interação está bloqueada.");
    await createFriendRequest({ ...firebaseUser, ...profile }, user);
  }
  async function acceptRequest(request) {
    const selectedRequest = typeof request === "string" ? requests.find((item) => item.id === request) : request;
    if (selectedRequest) await acceptFriendRequest(selectedRequest);
  }
  async function rejectRequest(requestId) { await rejectFriendRequest(requestId); }
  async function deleteFriend(friendshipId) { await removeFriend(friendshipId); }
  async function blockUser(user) { await blockFirestoreUser(firebaseUser.uid, user.uid); }
  async function unblockUser(blockId) { await unblockFirestoreUser(blockId); }
  async function respondInvite(invite, accepted) { await respondToGroupInvite(invite, accepted); }
  async function inviteUser(groupId, user) { return inviteToGroup(groupId, { ...firebaseUser, ...profile }, user); }
  async function createGroup(data) { return createFirestoreGroup(data, firebaseUser.uid); }
  async function updateGroup(groupId, changes) { return updateFirestoreGroup(groupId, changes); }
  async function deleteGroup(groupId) { return deleteFirestoreGroup(groupId); }
  async function createChannel(groupId, data) { return createFirestoreChannel(groupId, data); }
  async function deleteChannel(groupId, channelId) { return deleteFirestoreChannel(groupId, channelId); }
  async function sendChannelMessage(channelId, text) {
    const group = groups.find((item) => item.channels?.some((channel) => channel.id === channelId));
    if (group) await sendFirestoreChannelMessage(group.id, channelId, { ...firebaseUser, ...profile }, text);
  }
  async function editChannelMessage(channelId, messageId, text) {
    const group = groups.find((item) => item.channels?.some((channel) => channel.id === channelId));
    if (group) await editFirestoreChannelMessage(group.id, channelId, messageId, text);
  }
  async function deleteChannelMessage(channelId, messageId) {
    const group = groups.find((item) => item.channels?.some((channel) => channel.id === channelId));
    if (group) await deleteFirestoreChannelMessage(group.id, channelId, messageId);
  }

  return <SocialContext.Provider value={{ groups, friends, requests, invites, blocked, notifications, error, createGroup, updateGroup, deleteGroup, createChannel, deleteChannel, sendChannelMessage, editChannelMessage, deleteChannelMessage, addFriendRequest, acceptRequest, rejectRequest, removeFriend: deleteFriend, blockUser, unblockUser, inviteUser, respondInvite, markNotificationRead: markFirestoreNotificationRead, markAllNotificationsRead: () => markAllFirestoreNotificationsRead(notifications) }}>
    {children}
  </SocialContext.Provider>;
}

export function useSocial() { return useContext(SocialContext); }
