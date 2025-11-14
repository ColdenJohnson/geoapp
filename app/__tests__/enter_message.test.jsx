import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import EnterMessageScreen from '@/app/enter_message';

jest.mock('@/lib/promiseStore', () => ({
  resolveMessage: jest.fn(),
}));

const { resolveMessage } = require('@/lib/promiseStore');
const { router } = require('expo-router');

describe('EnterMessageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.back.mockClear();
  });

  it('saves trimmed message and navigates back', () => {
    const { getByPlaceholderText, getByText } = render(<EnterMessageScreen />);

    fireEvent.changeText(getByPlaceholderText(/Write a short message/i), '   hello world   ');
    fireEvent.press(getByText('Save'));

    expect(resolveMessage).toHaveBeenCalledWith('hello world');
    expect(router.back).toHaveBeenCalled();
  });

  it('cancels entry and clears message value', () => {
    const { getByText } = render(<EnterMessageScreen />);

    fireEvent.press(getByText('Cancel'));

    expect(resolveMessage).toHaveBeenCalledWith(null);
    expect(router.back).toHaveBeenCalled();
  });

  it('allows saving empty message (TODO: add validation)', () => {
    const { getByText } = render(<EnterMessageScreen />);

    fireEvent.press(getByText('Save'));

    expect(resolveMessage).toHaveBeenCalledWith('');
  });
});
