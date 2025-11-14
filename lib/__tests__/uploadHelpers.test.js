jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

const mockPut = jest.fn();
const mockGetDownloadURL = jest.fn();
const mockRef = jest.fn(() => ({
  put: mockPut,
  getDownloadURL: mockGetDownloadURL,
}));

jest.mock('@react-native-firebase/storage', () => {
  return jest.fn(() => ({
    ref: mockRef,
  }));
});

const ImageManipulator = require('expo-image-manipulator');
const storage = require('@react-native-firebase/storage');
const uploadHelpers = require('../uploadHelpers');

describe('upload helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    mockGetDownloadURL.mockResolvedValue('https://download');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('compressImage resizes and returns new uri', async () => {
    ImageManipulator.manipulateAsync.mockResolvedValue({ uri: 'file://compressed.jpg' });

    const result = await uploadHelpers.compressImage('file://original.jpg', { width: 512, compress: 0.2 });

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file://original.jpg',
      [{ resize: { width: 512 } }],
      { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG }
    );
    expect(result).toBe('file://compressed.jpg');
  });

  it('uploadImage compresses, uploads, and returns download URL', async () => {
    ImageManipulator.manipulateAsync.mockResolvedValue({ uri: 'file://compressed.jpg' });
    const blobMock = jest.fn();
    global.fetch.mockResolvedValue({ blob: blobMock });
    blobMock.mockResolvedValue('blob');

    jest.spyOn(Date, 'now').mockReturnValue(111);

    const url = await uploadHelpers.uploadImage('file://photo.jpg');

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file://photo.jpg',
      [{ resize: { width: 1024 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
    );
    expect(global.fetch).toHaveBeenCalledWith('file://compressed.jpg');
    expect(blobMock).toHaveBeenCalled();
    expect(storage).toHaveBeenCalled();
    expect(mockRef).toHaveBeenCalledWith('images/111_photo.jpg');
    expect(mockPut).toHaveBeenCalledWith('blob');
    expect(mockGetDownloadURL).toHaveBeenCalled();
    expect(url).toBe('https://download');
  });
});
