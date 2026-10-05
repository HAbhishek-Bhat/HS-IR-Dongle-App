import Share from 'react-native-share';
import type {AedSession, RecordingSession} from '@domain/entities/types';
import {encodeBase64} from '@shared/utils/base64';

export type ExportFormat = 'json' | 'csv';

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function recordingToJson(session: RecordingSession): string {
  return JSON.stringify(session, null, 2);
}

export function aedSessionToJson(session: AedSession): string {
  return JSON.stringify(session, null, 2);
}

export function recordingToCsv(session: RecordingSession): string {
  const header = [
    'sessionId',
    'mode',
    'signatureKey',
    'protocol',
    'startedAt',
    'endedAt',
    'durationMs',
    'isPartial',
    'frameIndex',
    'receivedAtMs',
    'carrierHz',
    'timingsUs',
    'frameBytesHex',
  ].join(',');

  const rows = session.rawFrames.map((frame, index) =>
    [
      session.id,
      session.mode,
      session.signature.key,
      session.signature.protocol,
      session.startedAt,
      session.endedAt ?? '',
      String(session.durationMs),
      session.isPartial ? '1' : '0',
      String(index),
      String(frame.receivedAtMs),
      frame.carrierHz == null ? '' : String(frame.carrierHz),
      frame.timingsUs.join('|'),
      frame.frameBytesHex ?? '',
    ]
      .map(escapeCsv)
      .join(','),
  );

  return [header, ...rows].join('\n');
}

export function aedSessionToCsv(session: AedSession): string {
  const header = [
    'sessionId',
    'parserId',
    'manufacturer',
    'model',
    'eventId',
    'eventType',
    'label',
    'timestamp',
    'timingsUs',
    'frameBytesHex',
  ].join(',');

  const rows = session.events.map(event =>
    [
      session.id,
      session.parserId,
      session.manufacturer ?? '',
      session.model ?? '',
      event.id,
      event.type,
      event.label,
      event.timestamp,
      event.rawFrame.timingsUs.join('|'),
      event.rawFrame.frameBytesHex ?? '',
    ]
      .map(escapeCsv)
      .join(','),
  );

  return [header, ...rows].join('\n');
}

export class ExportService {
  async shareRecording(session: RecordingSession, format: ExportFormat): Promise<void> {
    const content = format === 'json' ? recordingToJson(session) : recordingToCsv(session);
    const ext = format === 'json' ? 'json' : 'csv';
    const mime = format === 'json' ? 'application/json' : 'text/csv';
    const dataUrl = `data:${mime};base64,${encodeBase64(unescape(encodeURIComponent(content)))}`;
    await Share.open({
      title: `Recording ${session.id}`,
      filename: `recording-${session.id}.${ext}`,
      url: dataUrl,
      type: mime,
      failOnCancel: false,
    });
  }

  async shareAedSession(session: AedSession, format: ExportFormat): Promise<void> {
    const content = format === 'json' ? aedSessionToJson(session) : aedSessionToCsv(session);
    const ext = format === 'json' ? 'json' : 'csv';
    const mime = format === 'json' ? 'application/json' : 'text/csv';
    const dataUrl = `data:${mime};base64,${encodeBase64(unescape(encodeURIComponent(content)))}`;
    await Share.open({
      title: `AED Session ${session.id}`,
      filename: `aed-session-${session.id}.${ext}`,
      url: dataUrl,
      type: mime,
      failOnCancel: false,
    });
  }
}
