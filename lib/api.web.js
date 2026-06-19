// Web-only mock API for the designer sandbox.
// All functions return realistic static data from designerMockData.js.
// No backend or auth token is required.

import {
  MOCK_QUESTS,
  MOCK_SAVED_QUEST_IDS,
  MOCK_PROFILE,
  MOCK_STATS,
  MOCK_FRIENDS,
  MOCK_FRIEND_REQUESTS,
  MOCK_TOP_PHOTOS,
  MOCK_FRIEND_ACTIVITY,
  MOCK_DUEL_PAIRS,
} from '@/lib/designerMockData';

export const TOKEN_SAFETY_BUFFER_MS = 15000;

export function isTokenFresh() {
  return true;
}

export async function newChallenge() {
  return null;
}

export async function addPhoto() {
  return null;
}

export async function fetchPhotosByPinId(pinId) {
  return [
    {
      _id: `photo-${pinId}-1`,
      file_url: `https://picsum.photos/seed/${pinId}a/400/530`,
      pin_id: pinId,
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      _id: `photo-${pinId}-2`,
      file_url: `https://picsum.photos/seed/${pinId}b/400/530`,
      pin_id: pinId,
      created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

export async function fetchChallengeByPinId(pinId) {
  return MOCK_QUESTS.find((q) => q._id === pinId) || MOCK_QUESTS[0];
}

export async function fetchPhotoComments() {
  return [];
}

export async function deletePhoto() {
  return null;
}

export async function createPhotoComment() {
  return null;
}

export async function likePhotoComment() {
  return null;
}

export async function unlikePhotoComment() {
  return null;
}

export async function fetchPhotoReactions() {
  return [];
}

export async function addPhotoReaction() {
  return null;
}

export async function deletePhotoReaction() {
  return null;
}

let _duelQueue = [...MOCK_DUEL_PAIRS];

export async function fetchGlobalDuel() {
  const pair = _duelQueue[0] || MOCK_DUEL_PAIRS[0];
  return pair;
}

export async function fetchGlobalDuelPool(count = 8) {
  const items = MOCK_DUEL_PAIRS.slice(0, count);
  return { items, remainingVotes: 50 };
}

export async function voteGlobalDuel() {
  _duelQueue = _duelQueue.slice(1);
  if (_duelQueue.length === 0) {
    _duelQueue = [...MOCK_DUEL_PAIRS];
  }
  return { success: true };
}

export async function refreshGlobalDuelToken(photoAId, photoBId) {
  return {
    voteToken: `refreshed-mock-token-${photoAId}-${photoBId}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

export async function fetchRankedQuests() {
  return MOCK_QUESTS;
}

export async function setPinPrivacy() {
  return null;
}

export async function saveQuest(pinId) {
  MOCK_SAVED_QUEST_IDS.add(pinId);
  return null;
}

export async function unsaveQuest(pinId) {
  MOCK_SAVED_QUEST_IDS.delete(pinId);
  return null;
}

export async function fetchSavedQuests() {
  return MOCK_QUESTS.filter((q) => MOCK_SAVED_QUEST_IDS.has(q._id));
}

export async function sendQuestChallenge() {
  return null;
}

export async function declineQuestChallenge() {
  return null;
}

export async function fetchAdminQuests() {
  return [];
}

export async function updateAdminQuestTags() {
  return null;
}

export async function fetchUsersByUID() {
  return MOCK_PROFILE;
}

export async function fetchUserStats() {
  return MOCK_STATS;
}

export async function fetchAchievementCatalog() {
  return [];
}

export async function fetchUserTopPhotos() {
  return MOCK_TOP_PHOTOS;
}

export async function fetchUserGallery() {
  return { photos: MOCK_TOP_PHOTOS, nextCursor: null };
}

export async function updateUserProfile() {
  return MOCK_PROFILE;
}

export async function setUserHandle() {
  return null;
}

export async function searchUserByHandle() {
  return [
    ...MOCK_FRIENDS,
    ...MOCK_FRIEND_REQUESTS.incoming,
  ];
}

export async function fetchContactMatches() {
  return [];
}

export async function requestFriend() {
  return { success: true, status: 'pending' };
}

export async function acceptFriendRequest() {
  return { success: true };
}

export async function rejectFriendRequest() {
  return { success: true };
}

export async function cancelFriendRequest() {
  return { success: true };
}

export async function removeFriend() {
  return { success: true };
}

export async function dismissFriendSuggestion() {
  return { success: true };
}

export async function fetchFriends() {
  return MOCK_FRIENDS;
}

export async function fetchFriendRequests() {
  return MOCK_FRIEND_REQUESTS;
}

export async function fetchFriendActivity() {
  return MOCK_FRIEND_ACTIVITY;
}

export async function registerPushToken() {
  return null;
}

export async function logNotificationEvent() {
  return null;
}

export async function deleteMyAccount() {
  return null;
}
