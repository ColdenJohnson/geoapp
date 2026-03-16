const { buildViewPhotoChallengeRoute, goBackOrHome } = require('../navigation');

describe('buildViewPhotoChallengeRoute', () => {
  it('builds the expected route params for a challenge detail screen', () => {
    expect(buildViewPhotoChallengeRoute({
      pinId: 'pin-123',
      message: 'Hello world',
      createdByHandle: 'colden',
    })).toEqual({
      pathname: '/view_photochallenge',
      params: {
        pinId: 'pin-123',
        message: 'Hello world',
        created_by_handle: 'colden',
      },
    });
  });

  it('normalizes challenge detail params to strings', () => {
    expect(buildViewPhotoChallengeRoute({
      pinId: 42,
      message: null,
      createdByHandle: undefined,
    })).toEqual({
      pathname: '/view_photochallenge',
      params: {
        pinId: '42',
        message: '',
        created_by_handle: '',
      },
    });
  });
});

describe('goBackOrHome', () => {
  it('goes back when router history is available', () => {
    const router = {
      canGoBack: jest.fn(() => true),
      back: jest.fn(),
      replace: jest.fn(),
    };

    goBackOrHome(router);

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces with fallback when router history is unavailable', () => {
    const router = {
      canGoBack: jest.fn(() => false),
      back: jest.fn(),
      replace: jest.fn(),
    };

    goBackOrHome(router, '/fallback');

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/fallback');
  });
});
