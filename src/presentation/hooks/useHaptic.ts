import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {useAppStore} from '../store/appStore';

export function useHaptic() {
  const enabled = useAppStore(s => s.settings.hapticFeedback);
  return {
    impact() {
      if (!enabled) return;
      ReactNativeHapticFeedback.trigger('impactMedium', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    },
    success() {
      if (!enabled) return;
      ReactNativeHapticFeedback.trigger('notificationSuccess', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    },
    warning() {
      if (!enabled) return;
      ReactNativeHapticFeedback.trigger('notificationWarning', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    },
  };
}
