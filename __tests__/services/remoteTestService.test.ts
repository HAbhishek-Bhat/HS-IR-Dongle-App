import {RemoteTestService} from '@domain/services/RemoteTestService';
import type {DongleService} from '@domain/services/DongleService';
import type {RecordingRepository} from '@domain/repositories/RecordingRepository';
import type {RawIrFrame} from '@domain/entities/types';

function setup() {
  let connected = true;
  const listeners = new Set<(frame: RawIrFrame) => void | Promise<void>>();
  const stateListeners = new Set<() => void>();
  const dongle = {
    isConnected: jest.fn(() => connected),
    startListening: jest.fn(async () => {}),
    stopListening: jest.fn(async () => {}),
    setCaptureSource: jest.fn(),
    flushFrames: jest.fn(async () => {}),
    onFrame: jest.fn((listener: (frame: RawIrFrame) => void | Promise<void>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    onConnectionChange: jest.fn((listener: () => void) => {
      stateListeners.add(listener);
      listener();
      return () => stateListeners.delete(listener);
    }),
  };
  const repository = {save: jest.fn(async () => {}), update: jest.fn(async () => {})};
  const routing = jest.fn();
  const service = new RemoteTestService(
    dongle as unknown as DongleService,
    repository as unknown as RecordingRepository,
    routing,
  );
  return {
    service,
    repository,
    dongle,
    routing,
    receive: (frame: RawIrFrame) => Promise.all([...listeners].map(listener => listener(frame))),
    disconnect: () => {
      connected = false;
      stateListeners.forEach(listener => listener());
    },
  };
}

const raw: RawIrFrame = {
  receivedAtMs: 123.5,
  carrierHz: null,
  timingsUs: [1, -2, 3],
  frameBytesHex: '00fF',
};

describe('RemoteTestService', () => {
  it('captures unknown frames exactly, stops without stopping hardware, and saves labeled remote source', async () => {
    const {service, repository, dongle, routing, receive} = setup();
    await service.start();
    await receive(raw);
    expect(repository.save.mock.calls).toHaveLength(1);
    expect(repository.update).not.toHaveBeenCalled();
    await service.stop();
    await receive({...raw, receivedAtMs: 124});
    expect(service.getSnapshot().count).toBe(1);
    const session = await service.save('  TV Power  ');
    expect(session).toMatchObject({source: 'REMOTE_TEST', label: 'TV Power', rawFrames: [raw]});
    expect(session.decodedSnapshots[0].protocol).toBe('RAW');
    expect(repository.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: session.id,
        label: 'TV Power',
        rawFrames: [raw],
      }),
    );
    expect(dongle.stopListening).not.toHaveBeenCalled();
    expect(routing.mock.calls).toEqual([[true], [false]]);
    expect(dongle.setCaptureSource.mock.calls).toEqual([['REMOTE_TEST'], ['AED']]);
    expect(service.getSnapshot().count).toBe(0);
  });

  it('does not lose buffered capture on failed persistence and detaches on disconnect', async () => {
    const {service, repository, receive, disconnect} = setup();
    await service.start();
    await receive(raw);
    disconnect();
    await service.stop();
    expect(service.getSnapshot()).toMatchObject({active: false, isPartial: true, count: 1});
    repository.update.mockRejectedValueOnce(new Error('full') as never);
    await expect(service.save()).rejects.toThrow('full');
    expect(service.getSnapshot().count).toBe(1);
    const session = await service.save();
    expect(session.rawFrames).toEqual([raw]);
    expect(session.isPartial).toBe(true);
  });

  it('copies timings at receipt and never bounds the saved capture to the UI preview', async () => {
    const {service, receive} = setup();
    await service.start();
    const timings = Array.from({length: 500}, (_, index) => (index % 2 ? -index : index));
    const received = receive({...raw, timingsUs: timings});
    timings[0] = 99;
    await received;
    for (let i = 0; i < 300; i++) await receive(raw);
    const session = await service.save();
    expect(session.rawFrames).toHaveLength(301);
    expect(session.rawFrames[0].timingsUs).toHaveLength(500);
    expect(session.rawFrames[0].timingsUs[0]).toBe(0);
  });

  it('clears only deliberately and rejects saves with no capture', async () => {
    const {service, receive, repository} = setup();
    await expect(service.save()).rejects.toThrow('Receive a frame');
    await service.start();
    await receive(raw);
    await service.clear();
    expect(service.getSnapshot()).toMatchObject({active: false, count: 0});
    expect(repository.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rawFrames: [raw],
        endedAt: expect.any(String),
      }),
    );
  });

  it('rejects frame delivery on storage failure and retries the retained draft before clear', async () => {
    const {service, receive, repository} = setup();
    await service.start();
    repository.save.mockRejectedValueOnce(new Error('full') as never);
    await expect(receive(raw)).rejects.toThrow('full');
    expect(service.getSnapshot()).toMatchObject({count: 1, persistenceError: 'full'});
    repository.save.mockRejectedValueOnce(new Error('still full') as never);
    await expect(service.clear()).rejects.toThrow('still full');
    expect(service.getSnapshot().count).toBe(1);
    await service.clear();
    expect(repository.save).toHaveBeenLastCalledWith(expect.objectContaining({rawFrames: [raw]}));
    expect(service.getSnapshot().count).toBe(0);
  });

  it('drains queued remote frames before restoring AED without blocking frame persistence', async () => {
    const {service, receive, dongle, repository} = setup();
    await service.start();
    let release = () => {};
    dongle.flushFrames.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );
    const stopping = service.stop();
    expect(dongle.setCaptureSource).toHaveBeenLastCalledWith('REMOTE_TEST');
    await receive(raw);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({rawFrames: [raw]}));
    release();
    await stopping;
    expect(dongle.setCaptureSource).toHaveBeenLastCalledWith('AED');
    expect(service.getSnapshot()).toMatchObject({active: false, count: 1});
  });
});
