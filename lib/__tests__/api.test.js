// This is a test file to show how jest tests will hypothetically be set up in the future.
// To run all jest tests at once, run `npx jest`. Also good for later on is `npx jest --watch`(once testing built out a bit more).

// To run a specific test file, run `npx jest path/to/testfile.js`
jest.mock('axios');
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
}));

const axios = require('axios');

let fetchAllLocationPins;

beforeAll(() => {
  jest.isolateModules(() => {
    ({ fetchAllLocationPins } = require('../api'));
  });
});

describe('fetchAllLocationPins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty array when the request fails', async () => {
    axios.get.mockRejectedValue(new Error('network error'));

    const result = await fetchAllLocationPins();

    expect(result).toEqual([]);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
