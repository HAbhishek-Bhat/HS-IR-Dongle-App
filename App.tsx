import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ErrorBoundary} from './src/app/ErrorBoundary';
import {initCrashReporting} from './src/app/crashReporting';
import {getContainer} from './src/di/container';
import {ThemeProvider, useTheme} from './src/presentation/theme/ThemeProvider';
import {RootNavigator} from './src/presentation/navigation/RootNavigator';
import {useDongleBootstrap} from './src/presentation/hooks/useDongle';
import {useAppStore} from './src/presentation/store/appStore';

function AppBootstrap({children}: {children: React.ReactNode}): React.JSX.Element {
  useDongleBootstrap();
  const autoSync = useAppStore(s => s.settings.autoSync);
  const crashReportingEnabled = useAppStore(s => s.settings.crashReportingEnabled);
  const theme = useTheme();

  useEffect(() => {
    Object.assign(getContainer().settings, useAppStore.getState().settings);
    initCrashReporting(crashReportingEnabled);
  }, [autoSync, crashReportingEnabled]);

  useEffect(() => {
    if (!autoSync) {
      getContainer().sync.stopBackgroundSync();
      return;
    }
    getContainer().sync.startBackgroundSync(30_000);
    return () => getContainer().sync.stopBackgroundSync();
  }, [autoSync]);

  return (
    <>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      {children}
    </>
  );
}

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ThemeProvider>
            <AppBootstrap>
              <RootNavigator />
            </AppBootstrap>
          </ThemeProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
