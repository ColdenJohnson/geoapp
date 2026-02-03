// This is a test file to show how jest tests will hypothetically be set up in the future.
// To run all jest tests at once, run `npx jest`. Also good for later on is `npx jest --watchAll`(once testing built out a bit more).

// To run a specific test file, run `npx jest path/to/testfile.js`
jest.mock('axios');
jest.mock('@react-native-firebase/auth', () => jest.fn(() => ({ currentUser: null })));

const axios = require('axios');
const auth = require('@react-native-firebase/auth');

const BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL ||
  'https://geode-backend-834952308922.us-central1.run.app';

const createMockUser = () => ({
  uid: 'uid-42',
  getIdToken: jest.fn(() => Promise.resolve('token-42')),
});

const loadApi = () => {
  let api;
  jest.isolateModules(() => {
    api = require('../api');
  });
  return api;
};

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockReturnValue({ currentUser: null });
});

describe('newChallenge', () => {
  it('creates a challenge and adds its initial photo', async () => {
    const mockUser = createMockUser();
    auth.mockReturnValue({ currentUser: mockUser });
    const { newChallenge } = loadApi();

    axios.post
      .mockResolvedValueOnce({ status: 200, data: { pinId: 'pin-1' } })
      .mockResolvedValueOnce({ status: 200, data: {} });

    const location = { coords: { latitude: 11, longitude: 22 } };
    await newChallenge(location, 'https://photo', 'Hello');

    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/new_challenge`,
      {
        message: 'Hello',
        location: { latitude: 11, longitude: 22 },
        file_url: 'https://photo',
      },
      { headers: { Authorization: 'Bearer token-42' } }
    );

    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/add_photo`,
      { pinId: 'pin-1', file_url: 'https://photo' },
      { headers: { Authorization: 'Bearer token-42' } }
    );
    expect(mockUser.getIdToken).toHaveBeenCalledTimes(2);
  });

  it('logs error path when backend omits pinId', async () => {
    const mockUser = createMockUser();
    auth.mockReturnValue({ currentUser: mockUser });
    const { newChallenge } = loadApi();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    axios.post.mockResolvedValueOnce({ status: 200, data: {} });

    const location = { coords: { latitude: 0, longitude: 0 } };
    await newChallenge(location, 'file', 'msg');

    // only initial request fired
    expect(axios.post).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('addPhoto', () => {
  it('sends add photo request with auth headers', async () => {
    const mockUser = createMockUser();
    auth.mockReturnValue({ currentUser: mockUser });
    const { addPhoto } = loadApi();

    axios.post.mockResolvedValue({ status: 200 });

    await addPhoto('pin-2', 'https://photo');

    expect(axios.post).toHaveBeenCalledWith(
      `${BASE_URL}/add_photo`,
      { pinId: 'pin-2', file_url: 'https://photo' },
      { headers: { Authorization: 'Bearer token-42' } }
    );
  });
});

describe('fetch helpers', () => {
  it('fetchAllLocationPins returns API data', async () => {
    const mockUser = createMockUser();
    auth.mockReturnValue({ currentUser: mockUser });
    const { fetchAllLocationPins } = loadApi();

    axios.get.mockResolvedValue({ data: [{ _id: '123' }] });

    await expect(fetchAllLocationPins()).resolves.toEqual([{ _id: '123' }]);
    expect(axios.get).toHaveBeenCalledWith(
      `${BASE_URL}/view_all_location_pins`,
      { headers: { Authorization: 'Bearer token-42' } }
    );
  });

  it('fetchAllLocationPins falls back to [] on failure', async () => {
    const { fetchAllLocationPins } = loadApi();
    axios.get.mockRejectedValue(new Error('network'));

    await expect(fetchAllLocationPins()).resolves.toEqual([]);
  });

  it('fetchPhotosByPinId returns payload', async () => {
    const { fetchPhotosByPinId } = loadApi();
    axios.get.mockResolvedValue({ data: [{ file_url: 'x' }] });

    await expect(fetchPhotosByPinId('pin-3')).resolves.toEqual([{ file_url: 'x' }]);
    expect(axios.get).toHaveBeenCalledWith(
      `${BASE_URL}/view_photos_by_pin/pin-3`,
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('fetchChallengeByPinId returns null on error', async () => {
    const { fetchChallengeByPinId } = loadApi();
    axios.get.mockRejectedValue(new Error('boom'));

    await expect(fetchChallengeByPinId('pin')).resolves.toBeNull();
  });

  it('fetchDuelByPinId coerces missing photos to []', async () => {
    const { fetchDuelByPinId } = loadApi();
    axios.get.mockResolvedValue({ data: {} });

    await expect(fetchDuelByPinId('pin')).resolves.toEqual({ photos: [], voteToken: null, expiresAt: null });
  });

  it('fetchGlobalDuel returns [] on failure', async () => {
    const { fetchGlobalDuel } = loadApi();
    axios.get.mockRejectedValue(new Error('fail'));

    await expect(fetchGlobalDuel()).resolves.toEqual({ photos: [], voteToken: null, expiresAt: null });
  });
});

describe('vote endpoints', () => {
  it('voteDuel posts payload', async () => {
    const mockUser = createMockUser();
    auth.mockReturnValue({ currentUser: mockUser });
    const { voteDuel } = loadApi();
    axios.post.mockResolvedValue({ data: { success: true } });

    await expect(
      voteDuel({ pinId: 'pin', winnerPhotoId: 'w', loserPhotoId: 'l', voteToken: 'vtok' })
    ).resolves.toEqual({ success: true });
    expect(axios.post).toHaveBeenCalledWith(
      `${BASE_URL}/vote_duel`,
      { pinId: 'pin', winnerPhotoId: 'w', loserPhotoId: 'l', voteToken: 'vtok' },
      { headers: { Authorization: 'Bearer token-42' } }
    );
  });

  it('voteGlobalDuel handles errors by returning default payload', async () => {
    const { voteGlobalDuel } = loadApi();
    const error = Object.assign(new Error('bad'), {
      response: { status: 500, data: { error: 'boom' } },
    });
    axios.post.mockRejectedValue(error);

    await expect(
      voteGlobalDuel({ winnerPhotoId: 'w', loserPhotoId: 'l', voteToken: 'vtok' })
    ).resolves.toEqual({ success: false, error: 'boom', status: 500 });
  });
});

describe('profile helpers', () => {
  it('fetchUsersByUID returns profile data', async () => {
    const { fetchUsersByUID } = loadApi();
    axios.get.mockResolvedValue({ data: { display_name: 'Jane' } });

    await expect(fetchUsersByUID('uid-1')).resolves.toEqual({ display_name: 'Jane' });
  });

  it('updateUserProfile PATCHes and returns payload', async () => {
    const { updateUserProfile } = loadApi();
    axios.patch.mockResolvedValue({ data: { display_name: 'New' } });

    await expect(updateUserProfile('uid-1', { display_name: 'New' })).resolves.toEqual({ display_name: 'New' });
    expect(axios.patch).toHaveBeenCalledWith(
      `${BASE_URL}/update_user_profile/uid-1`,
      { display_name: 'New' },
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('deleteMyAccount returns default success even if response empty', async () => {
    const { deleteMyAccount } = loadApi();
    axios.delete.mockResolvedValue({});

    await expect(deleteMyAccount()).resolves.toEqual({ success: true });
  });

  it('registerPushToken posts token payload with auth header', async () => {
    const mockUser = createMockUser();
    auth.mockReturnValue({ currentUser: mockUser });
    const { registerPushToken } = loadApi();
    axios.post.mockResolvedValue({ status: 200 });

    await registerPushToken({
      token: 'expo-token',
      platform: 'ios',
      timezoneOffsetMinutes: -300,
      uid: 'uid-1',
    });

    expect(axios.post).toHaveBeenCalledWith(
      `${BASE_URL}/register_push_token`,
      {
        token: 'expo-token',
        platform: 'ios',
        timezoneOffsetMinutes: -300,
        uid: 'uid-1',
      },
      { headers: { Authorization: 'Bearer token-42' } }
    );
  });
});
