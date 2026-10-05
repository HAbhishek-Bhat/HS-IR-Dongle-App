/**
 * Detox E2E: simulator-mode capture flow (no hardware required).
 *
 * Prerequisites:
 * - Emulator running
 * - App built with mock simulator available in Settings
 * - detox configured (see .detoxrc.js)
 */
describe('HS IR Capture simulator flow', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
  });

  it('reaches home and can open device capture when simulator is connected', async () => {
    // Splash → onboarding may appear on first launch; prefer fresh install with seeded state in CI.
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(60000)
      .catch(async () => {
        // First-run path: complete minimal onboarding if present
        try {
          await element(by.id('onboarding-screen')).tap();
        } catch {
          // already past onboarding
        }
      });

    await expect(element(by.id('home-screen'))).toBeVisible();
    await element(by.id('card-device-capture')).tap();
    await expect(element(by.id('device-capture-screen'))).toBeVisible();
  });
});
