import type {DecodedIrData, IrProtocolFamily, RawIrFrame, SignalSignature} from '../../entities/types';

/**
 * Signal-signature approach for "device detection"
 * ----------------------------------------
 * IR remotes/AEDs do not advertise identity. We synthesize a stable identity from:
 *   1. Protocol family (NEC, RC5, SIRC, RAW, …)
 *   2. Carrier frequency (when available)
 *   3. Address / device ID code from the decoded payload
 *   4. For RAW-only frames: a compact hash of the first timing pattern
 *
 * Devices with the same signature are treated as the same logical source.
 * Strength is derived from how recently/frequently frames match that signature.
 */

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function timingPatternFingerprint(timingsUs: readonly number[]): string {
  const sample = timingsUs.slice(0, 32).map(t => Math.round(Math.abs(t) / 50) * 50);
  return fnv1a32(sample.join(','));
}

export function buildSignalSignature(
  frame: RawIrFrame,
  decoded: DecodedIrData | null,
): SignalSignature {
  const protocol: IrProtocolFamily = decoded?.protocol ?? 'RAW';
  const address = decoded?.address ?? null;
  const deviceIdCode =
    decoded?.extras?.deviceId != null ? String(decoded.extras.deviceId) : address != null ? `0x${address.toString(16)}` : null;

  const carrierPart = frame.carrierHz != null ? String(frame.carrierHz) : 'na';
  const idPart =
    deviceIdCode ??
    (decoded?.command != null ? `cmd:${decoded.command}` : `fp:${timingPatternFingerprint(frame.timingsUs)}`);

  const key = fnv1a32(`${protocol}|${carrierPart}|${idPart}`);
  const displayName =
    protocol === 'RAW' || protocol === 'UNKNOWN'
      ? `IR Device ${key.slice(0, 6).toUpperCase()}`
      : `${protocol} ${deviceIdCode ?? 'Device'}`;

  return {
    key,
    protocol,
    carrierHz: frame.carrierHz,
    address,
    deviceIdCode,
    displayName,
  };
}

export function signalStrengthFromRecency(lastSeenAtIso: string, nowMs: number = Date.now()): number {
  const ageMs = Math.max(0, nowMs - new Date(lastSeenAtIso).getTime());
  if (ageMs < 2_000) {
    return 1;
  }
  if (ageMs < 5_000) {
    return 0.8;
  }
  if (ageMs < 15_000) {
    return 0.5;
  }
  if (ageMs < 60_000) {
    return 0.25;
  }
  return 0.1;
}
