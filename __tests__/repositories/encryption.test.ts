import {decryptString, encryptString} from '@data/db/encryption';

describe('capture blob encryption', () => {
  it('round-trips a large capture without exceeding the JS function argument limit', async () => {
    const raw = JSON.stringify({
      frames: Array.from({length: 2000}, (_, index) => ({
        receivedAtMs: index,
        frameBytesHex: 'AA55'.repeat(64),
        timingsUs: [],
      })),
    });
    expect(raw.length).toBeGreaterThan(500_000);
    const encrypted = await encryptString(raw);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toContain('frameBytesHex');
    expect(await decryptString(encrypted)).toBe(raw);
  });
});
