import React from 'react';
import { render } from '@testing-library/react-native';

import ChallengeCameraStage from '@/components/camera/ChallengeCameraStage';

const cameraModule = require('react-native-vision-camera');

describe('ChallengeCameraStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects a native 4:3 capture format while keeping the preview high quality', () => {
    render(
      <ChallengeCameraStage
        helperText="Snap a photo"
        onPhotoCaptured={jest.fn()}
      />
    );

    expect(cameraModule.useCameraFormat).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mock-back-camera' }),
      [
        { photoAspectRatio: 4 / 3 },
        { photoResolution: 'max' },
        { videoResolution: 'max' },
      ]
    );
    expect(cameraModule.__mocks__.getLastCameraProps().format).toEqual(cameraModule.__mocks__.mockFormat);
  });
});
