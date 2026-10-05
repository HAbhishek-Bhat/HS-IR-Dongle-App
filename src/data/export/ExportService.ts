import Share from 'react-native-share';
import type {AedSession, RecordingSession} from '@domain/entities/types';
import {encodeBase64} from '@shared/utils/base64';

export type ExportFormat = 'json' | 'csv';

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function recordingToJson(session: RecordingSession): string {
  return JSON.stringify(
    {...session, source: session.source ?? 'AED', label: session.label ?? null},
    null,
    2,
  );
}

export function aedSessionToJson(session: AedSession): string {
  return JSON.stringify(
    {
      ...session,
      source: 'AED',
      rawFrames: session.rawFrames ?? session.events.map(event => event.rawFrame),
    },
    null,
    2,
  );
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
    'source',
    'label',
    'decodedProtocol',
    'decodedAddress',
    'decodedCommand',
    'decodedConfidence',
    'decodedExtras',
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
      session.source ?? 'AED',
      session.label ?? '',
      session.decodedSnapshots[index]?.protocol ?? '',
      session.decodedSnapshots[index]?.address?.toString() ?? '',
      session.decodedSnapshots[index]?.command?.toString() ?? '',
      session.decodedSnapshots[index]?.confidence.toString() ?? '',
      JSON.stringify(session.decodedSnapshots[index]?.extras ?? {}),
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
    'source',
    'frameIndex',
    'receivedAtMs',
    'carrierHz',
    'decodedProtocol',
    'decodedAddress',
    'decodedCommand',
    'decodedExtras',
    'rawBytesHex',
    'rawTimingsUs',
  ].join(',');

  const frames = session.rawFrames ?? session.events.map(event => event.rawFrame);
  const rows = frames.flatMap((frame, index) => {
    const events = session.events.filter(item =>
      typeof item.metadata.rawFrameIndex === 'number'
        ? item.metadata.rawFrameIndex === index
        : item.rawFrame.receivedAtMs === frame.receivedAtMs &&
          item.rawFrame.frameBytesHex === frame.frameBytesHex &&
          item.rawFrame.timingsUs.join('|') === frame.timingsUs.join('|'),
    );
    return (events.length ? events : [null]).map(event =>
      [
        session.id,
        session.parserId,
        session.manufacturer ?? '',
        session.model ?? '',
        event?.id ?? '',
        event?.type ?? '',
        event?.label ?? '',
        event?.timestamp ?? '',
        frame.timingsUs.join('|'),
        frame.frameBytesHex ?? '',
        'AED',
        String(index),
        String(frame.receivedAtMs),
        frame.carrierHz?.toString() ?? '',
        event?.decoded?.protocol ?? '',
        event?.decoded?.address?.toString() ?? '',
        event?.decoded?.command?.toString() ?? '',
        JSON.stringify(event?.decoded?.extras ?? {}),
        frame.frameBytesHex ?? '',
        frame.timingsUs.join('|'),
      ]
        .map(escapeCsv)
        .join(','),
    );
  });

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
