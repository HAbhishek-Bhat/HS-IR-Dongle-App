declare const device: {
  launchApp: (opts?: {newInstance?: boolean; delete?: boolean}) => Promise<void>;
  pressBack: () => Promise<void>;
};
declare const element: (matcher: unknown) => {
  tap: () => Promise<void>;
  replaceText: (text: string) => Promise<void>;
};
declare const by: {
  id: (id: string) => unknown;
  label: (label: string) => unknown;
  text: (text: string) => unknown;
};
declare function expect(el: unknown): {toBeVisible: () => Promise<void>};
declare function waitFor(el: unknown): {
  toBeVisible: () => {
    withTimeout: (
      ms: number,
    ) => Promise<void> & {catch: (fn: () => Promise<void>) => Promise<void>};
  };
};
