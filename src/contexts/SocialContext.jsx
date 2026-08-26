import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { acceptFriendRequest, createFriendRequest, rejectFriendRequest, removeFriend, subscribeToFriendRequests, subscribeToFriends } from "../services/friendService";
import { createChannel as createFirestoreChannel, createGroup as createFirestoreGroup, deleteChannel as deleteFirestoreChannel, deleteGroup as deleteFirestoreGroup, deleteChannelMessage as deleteFirestoreChannelMessage, editChannelMessage as editFirestoreChannelMessage, sendChannelMessage as sendFirestoreChannelMessage, subscribeToChannelMessages, subscribeToGroupChannels, subscribeToGroups, updateGroup as updateFirestoreGroup } from "../services/communityService";

const SocialContext = createContext(null);

export function SocialProvider({ children }) {
  const { firebaseUser, profile } = useAuth();
  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseUser) return undefined;
    return subscribeToGroups(firebaseUser.uid, setGroups, (snapshotError) => setError(snapshotError.message));
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return undefined;
    const unsubscribeFriends = subscribeToFriends(firebaseUser.uid, setFriends, (snapshotError) => setError(snapshotError.message));
    const unsubscribeRequests = subscribeToFriendRequests(firebaseUser.uid, setRequests, (snapshotError) => setError(snapshotError.message));
    return () => { unsubscribeFriends(); unsubscribeRequests(); };
  }, [firebaseUser]);

  useEffect(() => {
    const unsubscribers = [];
    groups.forEach((group) => {
      unsubscribers.push(subscribeToGroupChannels(group.id, (channels) => {
        setGroups((current) => current.map((item) => item.id === group.id ? { ...item, channels } : item));
      }, (snapshotError) => setError(snapshotError.message)));
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [groups.map((group) => group.id).join(",")]);

  useEffect(() => {
    const unsubscribers = [];
    groups.forEach((group) => (group.channels ?? []).forEach((channel) => {
      unsubscribers.push(subscribeToChannelMessages(group.id, channel.id, (messages) => {
        setGroups((current) => current.map((item) => item.id === group.id ? { ...item, channels: item.channels.map((entry) => entry.id === channel.id ? { ...entry, messages } : entry) } : item));
      }, (snapshotError) => setError(snapshotError.message)));
    }));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [groups.map((group) => `${group.id}:${(group.channels ?? []).map((channel) => channel.id).join("|")}`).join(",")]);

  async function addFriendRequest(user) {
    if (!firebaseUser || !user?.uid || user.uid === firebaseUser.uid) return;
    await createFriendRequest({ ...firebaseUser, ...profile }, user);
  }
  async function acceptRequest(request) {
    const selectedRequest = typeof request === "string" ? requests.find((item) => item.id === request) : request;
    if (selectedRequest) await acceptFriendRequest(selectedRequest);
  }
  async function rejectRequest(requestId) { await rejectFriendRequest(requestId); }
  async function deleteFriend(friendshipId) { await removeFriend(friendshipId); }
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

  return <SocialContext.Provider value={{ groups, friends, requests, blocked: [], notifications: [], error, createGroup, updateGroup, deleteGroup, createChannel, deleteChannel, sendChannelMessage, editChannelMessage, deleteChannelMessage, addFriendRequest, acceptRequest, rejectRequest, removeFriend: deleteFriend, blockUser: async () => {}, unblockUser: async () => {}, markNotificationRead: () => {}, markAllNotificationsRead: () => {} }}>
    {children}
  </SocialContext.Provider>;
}

export function useSocial() { return useContext(SocialContext); }
