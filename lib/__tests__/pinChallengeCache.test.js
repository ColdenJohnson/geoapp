jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');

const loadCacheModule = () => {
  let cacheModule;
  jest.isolateModules(() => {
    cacheModule = require('../pinChallengeCache');
  });
  return cacheModule;
};

describe('pinChallengeCache comments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes comment cache to memory and AsyncStorage', async () => {
    const { writePinCommentsCache, readPinCommentsCache } = loadCacheModule();
    const comments = [{ _id: 'comment-1', text: 'cached' }];

    await writePinCommentsCache('photo-1', comments, { fetchedAt: 123 });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'pin_comments_cache_photo-1',
      JSON.stringify({ comments, fetchedAt: 123, isDirty: false })
    );

    await expect(readPinCommentsCache('photo-1', { ttlMs: 1000 })).resolves.toEqual({
      comments,
      hadCache: true,
      isFresh: false,
      isDirty: false,
    });
  });

  it('hydrates comment cache from AsyncStorage and reports freshness', async () => {
    const now = Date.now();
    const comments = [{ _id: 'comment-2', text: 'from-storage' }];
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({ comments, fetchedAt: now })
    );

    const { readPinCommentsCache } = loadCacheModule();

    await expect(readPinCommentsCache('photo-2')).resolves.toEqual({
      comments,
      hadCache: true,
      isFresh: true,
      isDirty: false,
    });
  });

  it('treats dirty comment cache as immediately available but stale', async () => {
    const { writePinCommentsCache, readPinCommentsCache } = loadCacheModule();
    const comments = [{ _id: 'comment-3', text: 'optimistic' }];

    await writePinCommentsCache('photo-3', comments, { fetchedAt: Date.now(), isDirty: true });

    await expect(readPinCommentsCache('photo-3')).resolves.toEqual({
      comments,
      hadCache: true,
      isFresh: false,
      isDirty: true,
    });
  });
});

describe('pinChallengeCache photos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes photo cache to memory and AsyncStorage', async () => {
    const { writePinPhotosCache, readPinPhotosCache } = loadCacheModule();
    const photos = [{ _id: 'photo-1', file_url: 'https://one' }];

    await writePinPhotosCache('pin-1', photos, { fetchedAt: 456 });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'pin_photos_cache_pin-1',
      JSON.stringify({ photos, fetchedAt: 456, isDirty: false })
    );

    await expect(readPinPhotosCache('pin-1', { ttlMs: 1000 })).resolves.toEqual({
      photos,
      hadCache: true,
      isFresh: false,
      isDirty: false,
    });
  });

  it('treats optimistic photo cache as stale until the server catches up', async () => {
    const { writePinPhotosCache, readPinPhotosCache } = loadCacheModule();
    const photos = [{ _id: 'optimistic-1', file_url: 'file://local', optimistic: true }];

    await writePinPhotosCache('pin-2', photos, { fetchedAt: Date.now() });

    await expect(readPinPhotosCache('pin-2')).resolves.toEqual({
      photos,
      hadCache: true,
      isFresh: false,
      isDirty: true,
    });
  });

  it('updates photo cache from the latest cached value', async () => {
    const { writePinPhotosCache, updatePinPhotosCache, readPinPhotosCache } = loadCacheModule();
    const initial = [{ _id: 'photo-2', file_url: 'https://two' }];

    await writePinPhotosCache('pin-3', initial, { fetchedAt: 789 });
    await updatePinPhotosCache('pin-3', (current) => [
      { _id: 'optimistic-2', file_url: 'file://local', optimistic: true },
      ...(Array.isArray(current) ? current : []),
    ]);

    await expect(readPinPhotosCache('pin-3')).resolves.toEqual({
      photos: [
        { _id: 'optimistic-2', file_url: 'file://local', optimistic: true },
        { _id: 'photo-2', file_url: 'https://two' },
      ],
      hadCache: true,
      isFresh: false,
      isDirty: true,
    });
  });
});
