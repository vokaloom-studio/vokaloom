import { expect, test } from "@playwright/test";

test.describe("Vokaloom Studio Workbench E2E", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test("renders desktop (1440x900) and mobile (390x844) with zero horizontal overflow in EN and ES", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.getByTestId("tab-backgrounds")).toBeVisible();
    await expect(page.getByTestId("tab-voice")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("lang-en")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    const desktopEnOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopEnOverflow).toBe(false);

    // Toggle ES on desktop and check zero overflow + <html lang="es">
    await page.getByTestId("lang-es").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByTestId("lang-es")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    const desktopEsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopEsOverflow).toBe(false);

    // Check mobile viewport (390x844) in ES then switch back to EN
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileEsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileEsOverflow).toBe(false);

    await page.getByTestId("lang-en").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("lang-en")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    const mobileEnOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileEnOverflow).toBe(false);
  });

  test("toggles 5x / 15x batch mode, frame selection, and Safe Zones guide toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Wait for initial 15-card showcase preload and ensure no duplicate batch toggle in inspector
    await expect(page.getByTestId("bg-card")).toHaveCount(15, {
      timeout: 15000,
    });
    await expect(page.getByTestId("canvas-count")).toHaveText("15/15");
    await expect(page.locator('aside [data-testid="batch-5"]')).toHaveCount(0);

    // Multi-frame selection & dynamic ZIP clear control
    const check1 = page.getByTestId("select-frame-1");
    const check2 = page.getByTestId("select-frame-2");
    await check1.click();
    await check2.click();
    await expect(check1).toHaveAttribute("aria-checked", "true");
    await expect(check2).toHaveAttribute("aria-checked", "true");

    const clearBtn = page.getByTestId("btn-clear-selection");
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(clearBtn).toBeHidden();
    await expect(check1).toHaveAttribute("aria-checked", "false");

    // 9:16 Safe Zones overlay toggle
    const safeZonesBtn = page.getByTestId("btn-safe-zones");
    await expect(safeZonesBtn).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("safe-zone-guide")).toHaveCount(0);

    await safeZonesBtn.click();
    await expect(safeZonesBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("safe-zone-guide")).toHaveCount(15);

    await safeZonesBtn.click();
    await expect(safeZonesBtn).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("safe-zone-guide")).toHaveCount(0);

    // Switch to 5x batch mode and fetch 5 photos (consuming 1 of 3 credits)
    await page.getByTestId("batch-5").click();
    await expect(page.getByTestId("batch-5")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("batch-15")).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("bg-card")).toHaveCount(5, {
      timeout: 15000,
    });
    await expect(page.getByTestId("canvas-count")).toHaveText("5/5");
    await expect(page.getByTestId("status-quota")).toContainText(/^2\/3/);
  });

  test("switches tabs, synthesizes voiceover with unified custom transport, and logs to Session History", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const voiceTab = page.getByTestId("tab-voice");
    await voiceTab.click();
    await expect(voiceTab).toHaveAttribute("aria-selected", "true");

    // Disable zero-shot clone mode so preset Kokoro-82M / fallback synthesizes immediately
    const cloneToggle = page.getByTestId("btn-clone-toggle");
    await expect(cloneToggle).toHaveAttribute("aria-expanded", "true");
    await cloneToggle.click();
    await expect(cloneToggle).toHaveAttribute("aria-expanded", "false");

    await page.getByTestId("btn-synthesize").click();
    await expect(page.getByTestId("voice-history-count")).toHaveText("(1/10)", {
      timeout: 15000,
    });

    // Confirm unified custom transport deck (zero native <audio controls>)
    await expect(page.locator("audio[controls]")).toHaveCount(0);
    const audioEl = page.locator("audio");
    await expect(audioEl).toHaveCount(1);
    await expect(audioEl).toHaveAttribute("src", /.+/);
    await expect(
      page.locator('[data-testid="voice-waveform"] button')
    ).toHaveCount(48);

    const speedBtn = page.getByTestId("btn-speed-toggle");
    await expect(speedBtn).toHaveText("1.0x");
    await speedBtn.click();
    await expect(speedBtn).toHaveText("1.15x");

    const muteBtn = page.getByTestId("btn-mute-toggle");
    expect(await audioEl.evaluate((el: HTMLAudioElement) => el.muted)).toBe(
      false
    );
    await muteBtn.click();
    expect(await audioEl.evaluate((el: HTMLAudioElement) => el.muted)).toBe(
      true
    );

    await expect(page.getByTestId("voice-timecode")).toBeVisible();
    await expect(page.getByTestId("btn-download-audio")).toBeVisible();
    await expect(page.getByTestId("btn-replay-0")).toBeVisible();
  });

  test("opens Upgrade modal, unlocks pro_client Pro Pass without exposing /admin link, and enforces /admin auth gate", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByTestId("btn-upgrade").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("paywall-title")).toBeVisible();

    // Verify currency selector toggles COP vs USD headline cleanly
    await expect(page.getByTestId("currency-cop")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("paywall-price")).toHaveText("$60,000 COP");

    await page.getByTestId("currency-usd").click();
    await expect(page.getByTestId("currency-usd")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("paywall-price")).toHaveText("$15 USD");

    // Activate pro_client code and verify strict role isolation
    const codeInput = page.getByTestId("input-access-code");
    await expect(codeInput).toBeVisible();
    await codeInput.fill("VOKALOOM-PRO-2026");
    await page.getByTestId("btn-unlock-code").click();

    await expect(dialog).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId("badge-pro-pass")).toBeVisible();
    await expect(page.getByTestId("btn-upgrade")).toHaveCount(0);
    await expect(page.getByTestId("link-admin")).toHaveCount(0);
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);

    const storedQuota = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("vokaloom_quota_v1") || "{}")
    );
    expect(storedQuota.role).toBe("pro_client");
    expect(storedQuota.isPro).toBe(true);
    expect(storedQuota.isOperator).toBe(false);

    // /admin must still require operator authentication even with pro_client entitlement cookie
    await page.goto("/admin");
    await expect(page.locator("#admin-master-password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
