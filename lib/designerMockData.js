// Realistic mock data used by the designer web sandbox.
// Edit this file to change what data appears in the UI.

export const MOCK_USER = {
  uid: 'designer-preview-uid',
  email: 'designer@sidequest.app',
  phoneNumber: null,
  idToken: 'mock-id-token',
  isNewAccountSession: false,
};

export const MOCK_PROFILE = {
  _id: 'designer-preview-uid',
  uid: 'designer-preview-uid',
  handle: 'designer_preview',
  display_name: 'Designer Preview',
  photo_url: 'https://picsum.photos/seed/pfp/200/200',
  photo_count: 14,
  vote_count: 67,
  theme_preference: 'system',
};

export const MOCK_STATS = {
  photo_count: 14,
  vote_count: 67,
  earned_achievements: [],
  rank: null,
};

// Raw pin/quest shape as returned by the backend
export const MOCK_QUESTS = [
  {
    _id: 'pin-001',
    message: 'Find a street mural and capture the whole thing',
    created_by_handle: '@juno',
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['common', 'travel'],
    top_global_photo: { file_url: 'https://picsum.photos/seed/mural/400/530' },
    photo_count: 38,
  },
  {
    _id: 'pin-002',
    message: 'Catch someone mid-laugh',
    created_by_handle: '@reed',
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['social'],
    top_global_photo: { file_url: 'https://picsum.photos/seed/laugh/400/530' },
    photo_count: 21,
  },
  {
    _id: 'pin-003',
    message: 'Photograph a reflection in a puddle',
    created_by_handle: '@nina',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['nature', 'common'],
    top_global_photo: { file_url: 'https://picsum.photos/seed/puddle/400/530' },
    photo_count: 55,
  },
  {
    _id: 'pin-004',
    message: 'Take a photo of the tallest thing you can see',
    created_by_handle: '@marco',
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['travel', 'misc'],
    top_global_photo: { file_url: 'https://picsum.photos/seed/tall/400/530' },
    photo_count: 12,
  },
  {
    _id: 'pin-005',
    message: 'Find something that looks like a face',
    created_by_handle: '@lia',
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['crazy', 'common'],
    top_global_photo: { file_url: 'https://picsum.photos/seed/face/400/530' },
    photo_count: 89,
  },
  {
    _id: 'pin-006',
    message: 'Capture a local food stall or vendor',
    created_by_handle: '@sam',
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['food'],
    top_global_photo: { file_url: 'https://picsum.photos/seed/vendor/400/530' },
    photo_count: 34,
  },
];

export const MOCK_SAVED_QUEST_IDS = new Set(['pin-002', 'pin-005']);

export const MOCK_FRIENDS = [
  {
    uid: 'friend-uid-001',
    handle: 'juno',
    display_name: 'Juno',
    photo_url: 'https://picsum.photos/seed/juno/100/100',
    accepted_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    uid: 'friend-uid-002',
    handle: 'reed',
    display_name: 'Reed',
    photo_url: 'https://picsum.photos/seed/reed/100/100',
    accepted_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    uid: 'friend-uid-003',
    handle: 'nina',
    display_name: 'Nina',
    photo_url: 'https://picsum.photos/seed/nina/100/100',
    accepted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const MOCK_FRIEND_REQUESTS = {
  incoming: [
    {
      uid: 'stranger-uid-001',
      handle: 'marco',
      display_name: 'Marco',
      photo_url: 'https://picsum.photos/seed/marco/100/100',
      requested_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ],
  outgoing: [],
};

export const MOCK_TOP_PHOTOS = [
  {
    _id: 'photo-top-001',
    file_url: 'https://picsum.photos/seed/top1/400/530',
    pin_id: 'pin-003',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'photo-top-002',
    file_url: 'https://picsum.photos/seed/top2/400/530',
    pin_id: 'pin-001',
    created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const MOCK_FRIEND_ACTIVITY = {
  items: [
    {
      id: 'activity-001',
      type: 'challenge_participated',
      actor_uid: 'friend-uid-001',
      actor_handle: 'juno',
      actor_display_name: 'Juno',
      actor_photo_url: 'https://picsum.photos/seed/juno/100/100',
      challenge_prompt: 'Find a street mural and capture the whole thing',
      challenge_created_by_handle: '@juno',
      challenge_photo_url: 'https://picsum.photos/seed/act1/400/530',
      pin_id: 'pin-001',
      can_open: true,
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 'activity-002',
      type: 'challenge_participated',
      actor_uid: 'friend-uid-002',
      actor_handle: 'reed',
      actor_display_name: 'Reed',
      actor_photo_url: 'https://picsum.photos/seed/reed/100/100',
      challenge_prompt: 'Photograph a reflection in a puddle',
      challenge_created_by_handle: '@nina',
      challenge_photo_url: 'https://picsum.photos/seed/act2/400/530',
      pin_id: 'pin-003',
      can_open: true,
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  ],
  suggestions: [
    {
      uid: 'suggested-uid-001',
      handle: 'lia',
      display_name: 'Lia',
      photo_url: 'https://picsum.photos/seed/lia/100/100',
      mutual_count: 2,
    },
  ],
  interactionSuggestions: [
    {
      uid: 'suggested-uid-002',
      handle: 'sam',
      display_name: 'Sam',
      photo_url: 'https://picsum.photos/seed/sam/100/100',
    },
  ],
  pendingChallenges: [],
  nextCursor: null,
};

// Mock duel pairs for the Vote screen
export const MOCK_DUEL_PAIRS = [
  {
    photos: [
      { _id: 'duel-photo-A1', file_url: 'https://picsum.photos/seed/duelA1/400/530', pin_id: 'pin-001' },
      { _id: 'duel-photo-B1', file_url: 'https://picsum.photos/seed/duelB1/400/530', pin_id: 'pin-001' },
    ],
    voteToken: 'mock-vote-token-1',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    remainingVotes: 50,
    photoIds: ['duel-photo-A1', 'duel-photo-B1'],
    pairKey: 'duel-pair-key-1',
    bucketType: 'global',
    pinId: 'pin-001',
  },
  {
    photos: [
      { _id: 'duel-photo-A2', file_url: 'https://picsum.photos/seed/duelA2/400/530', pin_id: 'pin-003' },
      { _id: 'duel-photo-B2', file_url: 'https://picsum.photos/seed/duelB2/400/530', pin_id: 'pin-003' },
    ],
    voteToken: 'mock-vote-token-2',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    remainingVotes: 49,
    photoIds: ['duel-photo-A2', 'duel-photo-B2'],
    pairKey: 'duel-pair-key-2',
    bucketType: 'global',
    pinId: 'pin-003',
  },
  {
    photos: [
      { _id: 'duel-photo-A3', file_url: 'https://picsum.photos/seed/duelA3/400/530', pin_id: 'pin-002' },
      { _id: 'duel-photo-B3', file_url: 'https://picsum.photos/seed/duelB3/400/530', pin_id: 'pin-002' },
    ],
    voteToken: 'mock-vote-token-3',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    remainingVotes: 48,
    photoIds: ['duel-photo-A3', 'duel-photo-B3'],
    pairKey: 'duel-pair-key-3',
    bucketType: 'global',
    pinId: 'pin-002',
  },
];
