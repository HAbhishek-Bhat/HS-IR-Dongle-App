export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Privacy: undefined;
  Main: undefined;
  RecordingDetail: {id: string};
};

export type HomeStackParamList = {
  HomeMain: undefined;
  DeviceCapture: undefined;
  Recording: {signatureKey: string; displayName: string};
  AedList: undefined;
  AedSession: {signatureKey: string; displayName: string};
  RecordingDetail: {id: string};
};

export type HistoryStackParamList = {
  HistoryMain: undefined;
  RecordingDetail: {id: string};
};

export type MainTabParamList = {
  HomeTab: undefined;
  HistoryTab: undefined;
  SyncTab: undefined;
  SettingsTab: undefined;
};
