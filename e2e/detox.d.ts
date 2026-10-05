declare const device: {
  launchApp: (opts?: {newInstance?: boolean}) => Promise<void>;
};
declare const element: (matcher: unknown) => {
  tap: () => Promise<void>;
};
declare const by: {id: (id: string) => unknown};
declare function expect(el: unknown): {toBeVisible: () => Promise<void>};
declare function waitFor(el: unknown): {
  toBeVisible: () => {
    withTimeout: (ms: number) => Promise<void> & {catch: (fn: () => Promise<void>) => Promise<void>};
  };
};
