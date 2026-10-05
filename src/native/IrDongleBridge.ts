import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import type {DongleConnectionState, RawIrFrame} from '@domain/entities/types';

/**
 * Native bridge API (Android Kotlin module: IrDongleModule)
 *
 * Methods:
 *   initialize(): Promise<void>
 *   startListening(): Promise<void>
 *   stopListening(): Promise<void>
 *   requestPermission(): Promise<boolean>
 *   getConnectionState(): Promise<DongleConnectionNative>
 *   setSimulatorMode(enabled: boolean): Promise<void>
 *   destroy(): Promise<void>
 *
 * Events (DeviceEventEmitter / NativeEventEmitter):
 *   IrDongleConnectionChanged → DongleConnectionNative
 *   IrDongleFrameReceived → NativeIrFramePayload
 *   IrDongleError → { code: string; message: string }
 *   IrDonglePermissionResult → { granted: boolean }
 */

export type DongleConnectionNative = DongleConnectionState;

export interface NativeIrFramePayload {
  receivedAtMs: number;
  carrierHz: number | null;
  timingsUs: number[];
  frameBytesHex: string | null;
}

export interface IrDongleNativeModule {
  initialize(): Promise<void>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  requestPermission(): Promise<boolean>;
  getConnectionState(): Promise<DongleConnectionNative>;
  reconnect(): Promise<void>;
  setSimulatorMode(enabled: boolean): Promise<void>;
  destroy(): Promise<void>;
}

const LINKING_ERROR =
  "The package 'IrDongle' native module is not linked. Rebuild the Android app after installing dependencies.";

const NativeIrDongle: IrDongleNativeModule =
  NativeModules.IrDongle ??
  new Proxy(
    {},
    {
      get() {
        if (Platform.OS === 'android') {
          throw new Error(LINKING_ERROR);
        }
        // iOS: methods resolve as no-op stubs until Swift module exists
        return async () => {
          throw new Error(
            'IR USB dongle is not supported on iOS in this build. See docs/IOS_PLAN.md.',
          );
        };
      },
    },
  );

export const IrDongleEvents = {
  CONNECTION_CHANGED: 'IrDongleConnectionChanged',
  FRAME_RECEIVED: 'IrDongleFrameReceived',
  ERROR: 'IrDongleError',
  PERMISSION_RESULT: 'IrDonglePermissionResult',
} as const;

export interface IrDongleEventPayloads {
  IrDongleConnectionChanged: DongleConnectionNative;
  IrDongleFrameReceived: NativeIrFramePayload;
  IrDongleError: {code: string; message: string};
  IrDonglePermissionResult: {granted: boolean};
}

export interface IrDongleEventSource {
  addListener<K extends keyof IrDongleEventPayloads>(
    event: K,
    listener: (payload: IrDongleEventPayloads[K]) => void,
  ): {remove(): void};
}

export function createIrDongleEventEmitter(): IrDongleEventSource {
  const emitter = new NativeEventEmitter(NativeModules.IrDongle);
  return {
    addListener(event, listener) {
      return emitter.addListener(event, listener);
    },
  };
}

export function toRawIrFrame(payload: NativeIrFramePayload): RawIrFrame {
  return {
    receivedAtMs: payload.receivedAtMs,
    carrierHz: payload.carrierHz,
    timingsUs: Object.freeze([...payload.timingsUs]),
    frameBytesHex: payload.frameBytesHex,
  };
}

export const IrDongle = NativeIrDongle;
