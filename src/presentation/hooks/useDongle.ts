import {useEffect, useRef} from 'react';
import {getContainer} from '@di/container';
import {isDongleReady, type DongleService} from '@domain/services/DongleService';
import {toUserMessage} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';
import {useAppStore} from '../store/appStore';
import {useHaptic} from './useHaptic';

export function useDongleBootstrap(override?: DongleService): void {
  const setConnection = useAppStore(s => s.setConnection);
  const setLastError = useAppStore(s => s.setLastError);
  const mockEnabled = useAppStore(s => s.settings.mockSimulatorEnabled);
  const haptic = useHaptic();
  const hapticRef = useRef(haptic);
  hapticRef.current = haptic;
  const dongle = override ?? getContainer().dongle;

  useEffect(() => {
    let cancelled = false;
    let hadDongle = false;
    const unsubscribeConnection = dongle.onConnectionChange(state => {
      if (cancelled) return;
      const hasDongle = 'dongle' in state && state.dongle != null;
      if (hasDongle && !hadDongle) hapticRef.current.success();
      if (!hasDongle && hadDongle) hapticRef.current.warning();
      hadDongle = hasDongle;
      setConnection(state);
      setLastError(state.status === 'error' ? state.message : null);
    });
    const unsubscribeError = dongle.onError(error => {
      if (!cancelled) setLastError(error.userMessage);
    });
    void dongle.initialize().catch(error => {
      if (!cancelled) setLastError(toUserMessage(error));
    });
    return () => {
      cancelled = true;
      unsubscribeConnection();
      unsubscribeError();
      void dongle.destroy().catch(error => logger.error('Dongle shutdown failed', error));
    };
  }, [dongle, setConnection, setLastError]);

  useEffect(() => {
    let cancelled = false;
    void dongle
      .initialize()
      .then(async () => {
        if (!cancelled) await dongle.setSimulatorMode(__DEV__ && mockEnabled);
      })
      .catch(error => {
        if (!cancelled) {
          logger.error('Dongle mode change failed', error);
          setLastError(toUserMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dongle, mockEnabled, setLastError]);
}

export function useIsDongleConnected(): boolean {
  return useAppStore(s => isDongleReady(s.connection));
}
