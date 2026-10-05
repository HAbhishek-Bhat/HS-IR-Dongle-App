import {useEffect} from 'react';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';
import {useAppStore} from '../store/appStore';

export function useDongleBootstrap(): void {
  const setConnection = useAppStore(s => s.setConnection);
  const setLastError = useAppStore(s => s.setLastError);
  const mockEnabled = useAppStore(s => s.settings.mockSimulatorEnabled);

  useEffect(() => {
    const {dongle} = getContainer();
    let unsubConn = () => {};
    let unsubErr = () => {};
    (async () => {
      try {
        await dongle.initialize();
        if (mockEnabled) {
          await dongle.setSimulatorMode(true);
        }
        unsubConn = dongle.onConnectionChange(setConnection);
        unsubErr = dongle.onError(error => setLastError(error.userMessage));
      } catch (error) {
        setLastError(toUserMessage(error));
      }
    })();
    return () => {
      unsubConn();
      unsubErr();
    };
  }, [mockEnabled, setConnection, setLastError]);
}

export function useIsDongleConnected(): boolean {
  return useAppStore(s => s.connection.status === 'connected');
}
