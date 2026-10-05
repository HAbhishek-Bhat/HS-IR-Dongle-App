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
    await device.launchApp({newInstance: true, delete: true});
  });

  it('reaches home and can open device capture when simulator is connected', async () => {
    await waitFor(element(by.id('onboarding-screen')))
      .toBeVisible()
      .withTimeout(60000);
    await element(by.label('Email')).replaceText('simulator@example.test');
    await element(by.label('Password')).replaceText('simulator-test-password');
    await device.pressBack();
    await element(by.text('Continue')).tap();
    await waitFor(element(by.text('I understand and consent')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.text('I understand and consent')).tap();

    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('tab-settings')).tap();
    await element(by.id('mock-ir-simulator')).tap();
    await element(by.id('tab-home')).tap();
    await waitFor(element(by.text('Ready to receive')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('card-device-capture')).tap();
    await expect(element(by.id('device-capture-screen'))).toBeVisible();
  });
});
