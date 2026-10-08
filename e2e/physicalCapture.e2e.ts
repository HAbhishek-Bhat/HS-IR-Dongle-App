/**
 * Detox E2E: physical-only workflow navigation (no hardware required).
 *
 * Prerequisites:
 * - Emulator running
 * - detox configured (see .detoxrc.js)
 */
describe('HS IR Capture physical workflow navigation', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true, delete: true});
  });

  it('removes simulation controls and opens All Devices without a receiver', async () => {
    await waitFor(element(by.id('onboarding-screen')))
      .toBeVisible()
      .withTimeout(60000);
    await element(by.label('Email')).replaceText('capture@example.test');
    await element(by.label('Password')).replaceText('capture-test-password');
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
    await expect(element(by.id('mock-ir-simulator'))).not.toExist();
    await element(by.id('tab-home')).tap();
    await expect(element(by.id('card-remote-test'))).not.toExist();
    await element(by.id('card-all-devices')).tap();
    await expect(element(by.id('all-devices-screen'))).toBeVisible();
    await expect(element(by.label('Start listening'))).not.toBeEnabled();
  });
});
