import React from 'react';
import {Text} from 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import {TapSurface} from '@presentation/components/TapSurface';
import {PrimaryButton} from '@presentation/components/PrimaryButton';
import {ThemeProvider} from '@presentation/theme/ThemeProvider';

describe('smooth tap feedback', () => {
  afterEach(() => jest.restoreAllMocks());

  it('animates a subtle press and release while respecting reduced motion', () => {
    const timing = jest.spyOn(Reanimated, 'withTiming');
    const pressed = jest.fn();
    const screen = render(
      <TapSurface accessibilityRole="button" accessibilityLabel="Section" onPress={pressed}>
        <Text>Section</Text>
      </TapSurface>,
    );
    fireEvent(screen.getByLabelText('Section'), 'pressIn', {});
    expect(timing).toHaveBeenCalledWith(0.985, {
      duration: 110,
      reduceMotion: Reanimated.ReduceMotion.System,
    });
    fireEvent(screen.getByLabelText('Section'), 'pressOut', {});
    expect(timing).toHaveBeenLastCalledWith(1, {
      duration: 180,
      reduceMotion: Reanimated.ReduceMotion.System,
    });
    fireEvent.press(screen.getByLabelText('Section'));
    expect(pressed).toHaveBeenCalledTimes(1);
    screen.unmount();
  });

  it('keeps disabled and busy buttons non-interactive', () => {
    const pressed = jest.fn();
    const screen = render(
      <ThemeProvider>
        <PrimaryButton label="Start listening" disabled onPress={pressed} />
        <PrimaryButton label="Save capture" loading onPress={pressed} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByLabelText('Start listening'));
    fireEvent.press(screen.getByLabelText('Save capture'));
    expect(pressed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Start listening').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Save capture').props.accessibilityState.disabled).toBe(true);
    screen.unmount();
  });
});
