import type {AedEvent} from '../../entities/types';

export function getReportedAedSerialNumber(
  events: readonly Pick<AedEvent, 'metadata'>[],
): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const {parserId, serialNumber} = events[index].metadata;
    if (
      typeof parserId === 'string' &&
      parserId.length > 0 &&
      parserId !== 'raw-capture' &&
      parserId !== 'hs-aed-v1' &&
      typeof serialNumber === 'string' &&
      serialNumber.trim()
    ) {
      return serialNumber.trim();
    }
  }
  return null;
}
