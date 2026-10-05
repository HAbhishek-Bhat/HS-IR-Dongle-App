import {create} from 'zustand';
import type {
  AedEvent,
  AedSession,
  AppSettings,
  DetectedDevice,
  DongleConnectionState,
  RecordingSession,
  UserProfile,
} from '@domain/entities/types';

interface AppState {
  hydrated: boolean;
  onboardingComplete: boolean;
  user: UserProfile | null;
  connection: DongleConnectionState;
  detectedDevices: DetectedDevice[];
  detectedAeds: DetectedDevice[];
  liveTimings: number[];
  aedEvents: AedEvent[];
  activeRecordingId: string | null;
  activeAedSession: AedSession | null;
  recordings: RecordingSession[];
  aedSessions: AedSession[];
  settings: AppSettings;
  lastError: string | null;
  syncBusy: boolean;

  setHydrated: (v: boolean) => void;
  setOnboardingComplete: (v: boolean) => void;
  setUser: (user: UserProfile | null) => void;
  setConnection: (c: DongleConnectionState) => void;
  setDetectedDevices: (d: DetectedDevice[]) => void;
  setDetectedAeds: (d: DetectedDevice[]) => void;
  setLiveTimings: (t: number[]) => void;
  setAedEvents: (e: AedEvent[]) => void;
  setActiveRecordingId: (id: string | null) => void;
  setActiveAedSession: (s: AedSession | null) => void;
  setRecordings: (r: RecordingSession[]) => void;
  setAedSessions: (s: AedSession[]) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setLastError: (msg: string | null) => void;
  setSyncBusy: (v: boolean) => void;
}

const defaultSettings: AppSettings = {
  cloudProvider: 'rest',
  restApiBaseUrl: 'https://api.example.com/v1',
  mockSimulatorEnabled: false,
  darkMode: 'system',
  autoSync: true,
  hapticFeedback: true,
  crashReportingEnabled: false,
};

export const useAppStore = create<AppState>(set => ({
  hydrated: false,
  onboardingComplete: false,
  user: null,
  connection: {status: 'disconnected'},
  detectedDevices: [],
  detectedAeds: [],
  liveTimings: [],
  aedEvents: [],
  activeRecordingId: null,
  activeAedSession: null,
  recordings: [],
  aedSessions: [],
  settings: defaultSettings,
  lastError: null,
  syncBusy: false,

  setHydrated: hydrated => set({hydrated}),
  setOnboardingComplete: onboardingComplete => set({onboardingComplete}),
  setUser: user => set({user}),
  setConnection: connection => set({connection}),
  setDetectedDevices: detectedDevices => set({detectedDevices}),
  setDetectedAeds: detectedAeds => set({detectedAeds}),
  setLiveTimings: liveTimings => set({liveTimings}),
  setAedEvents: aedEvents => set({aedEvents}),
  setActiveRecordingId: activeRecordingId => set({activeRecordingId}),
  setActiveAedSession: activeAedSession => set({activeAedSession}),
  setRecordings: recordings => set({recordings}),
  setAedSessions: aedSessions => set({aedSessions}),
  updateSettings: partial => set(state => ({settings: {...state.settings, ...partial}})),
  setLastError: lastError => set({lastError}),
  setSyncBusy: syncBusy => set({syncBusy}),
}));
