describe('promiseStore upload resolver', () => {
  let setUploadResolver;
  let resolveUpload;

  beforeEach(() => {
    jest.resetModules();
    ({ setUploadResolver, resolveUpload } = require('../promiseStore'));
  });

  it('invokes stored resolver once and clears it', () => {
    const resolver = jest.fn();
    setUploadResolver(resolver);

    resolveUpload('payload');
    expect(resolver).toHaveBeenCalledWith('payload');

    resolver.mockClear();
    resolveUpload('another');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('ignores resolve calls when nothing registered', () => {
    expect(() => resolveUpload('noop')).not.toThrow();
  });

  it('supports independent upload resolvers by request id', () => {
    const first = jest.fn();
    const second = jest.fn();
    setUploadResolver(first, 'first');
    setUploadResolver(second, 'second');

    resolveUpload('one', 'first');
    resolveUpload('two', 'second');

    expect(first).toHaveBeenCalledWith('one');
    expect(second).toHaveBeenCalledWith('two');
  });
});

describe('promiseStore message resolver', () => {
  let setMessageResolver;
  let resolveMessage;

  beforeEach(() => {
    jest.resetModules();
    ({ setMessageResolver, resolveMessage } = require('../promiseStore'));
  });

  it('resolves and clears message resolver', () => {
    const resolver = jest.fn();
    setMessageResolver(resolver);

    resolveMessage('hello');
    expect(resolver).toHaveBeenCalledWith('hello');

    resolver.mockClear();
    resolveMessage('again');
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe('promiseStore geo lock resolver', () => {
  let setGeoLockResolver;
  let resolveGeoLock;

  beforeEach(() => {
    jest.resetModules();
    ({ setGeoLockResolver, resolveGeoLock } = require('../promiseStore'));
  });

  it('resolves and clears geo lock resolver', () => {
    const resolver = jest.fn();
    setGeoLockResolver(resolver);

    resolveGeoLock(false);
    expect(resolver).toHaveBeenCalledWith(false);

    resolver.mockClear();
    resolveGeoLock(true);
    expect(resolver).not.toHaveBeenCalled();
  });
});
