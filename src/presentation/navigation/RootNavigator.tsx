import React from 'react';
import {NavigationContainer, DefaultTheme, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {SplashScreen} from '../screens/Splash/SplashScreen';
import {OnboardingScreen} from '../screens/Onboarding/OnboardingScreen';
import {PrivacyScreen} from '../screens/Privacy/PrivacyScreen';
import {HomeScreen} from '../screens/Home/HomeScreen';
import {DeviceCaptureScreen} from '../screens/DeviceCapture/DeviceCaptureScreen';
import {RecordingScreen} from '../screens/Recording/RecordingScreen';
import {AedListScreen} from '../screens/AedList/AedListScreen';
import {AedSessionScreen} from '../screens/AedSession/AedSessionScreen';
import {HistoryScreen} from '../screens/History/HistoryScreen';
import {RecordingDetailScreen} from '../screens/RecordingDetail/RecordingDetailScreen';
import {SyncStatusScreen} from '../screens/SyncStatus/SyncStatusScreen';
import {SettingsScreen} from '../screens/Settings/SettingsScreen';
import type {
  HomeStackParamList,
  HistoryStackParamList,
  MainTabParamList,
  RootStackParamList,
} from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({label, focused, color}: {label: string; focused: boolean; color: string}) {
  return (
    <Text
      style={{color, fontSize: 11, fontWeight: focused ? '800' : '600'}}
      accessibilityElementsHidden>
      {label}
    </Text>
  );
}

function HomeStackNavigator(): React.JSX.Element {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} options={{title: 'Home'}} />
      <HomeStack.Screen
        name="DeviceCapture"
        component={DeviceCaptureScreen}
        options={{title: 'Device Capture'}}
      />
      <HomeStack.Screen
        name="Recording"
        component={RecordingScreen}
        options={{title: 'Recording'}}
      />
      <HomeStack.Screen name="AedList" component={AedListScreen} options={{title: 'AED Devices'}} />
      <HomeStack.Screen
        name="AedSession"
        component={AedSessionScreen}
        options={{title: 'AED Session'}}
      />
      <HomeStack.Screen
        name="RecordingDetail"
        component={RecordingDetailScreen}
        options={{title: 'Recording Detail'}}
      />
    </HomeStack.Navigator>
  );
}

function HistoryStackNavigator(): React.JSX.Element {
  return (
    <HistoryStack.Navigator>
      <HistoryStack.Screen
        name="HistoryMain"
        component={HistoryScreen}
        options={{title: 'History'}}
      />
      <HistoryStack.Screen
        name="RecordingDetail"
        component={RecordingDetailScreen}
        options={{title: 'Recording Detail'}}
      />
    </HistoryStack.Navigator>
  );
}

function MainTabs(): React.JSX.Element {
  const theme = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border},
      }}>
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: 'Home',
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: ({focused, color}) => (
            <TabIcon label="Home" focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryStackNavigator}
        options={{
          title: 'History',
          headerShown: true,
          tabBarIcon: ({focused, color}) => (
            <TabIcon label="Hist" focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SyncTab"
        component={SyncStatusScreen}
        options={{
          title: 'Sync',
          headerShown: true,
          tabBarIcon: ({focused, color}) => (
            <TabIcon label="Sync" focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarButtonTestID: 'tab-settings',
          headerShown: true,
          tabBarIcon: ({focused, color}) => <TabIcon label="Set" focused={focused} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const theme = useTheme();
  const navTheme = theme.isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          primary: theme.colors.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          primary: theme.colors.primary,
        },
      };

  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{headerShown: false}}>
        <RootStack.Screen name="Splash" component={SplashScreen} />
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        <RootStack.Screen
          name="Privacy"
          component={PrivacyScreen}
          options={{headerShown: true, title: 'Privacy'}}
        />
        <RootStack.Screen name="Main" component={MainTabs} />
        <RootStack.Screen
          name="RecordingDetail"
          component={RecordingDetailScreen}
          options={{headerShown: true, title: 'Recording Detail'}}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
