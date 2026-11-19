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
    await expect(
      page.getByRole("heading", { name: "Vokaloom Studio" })
    ).toBeVisible();

    const desktopEnOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopEnOverflow).toBe(false);

    // Toggle ES on desktop and check zero overflow
    await page.getByRole("button", { name: "ES", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: /Fondos Estéticos/i })
    ).toBeVisible();
    const desktopEsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopEsOverflow).toBe(false);

    // Check mobile viewport (390x844) in ES then switch to EN
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileEsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileEsOverflow).toBe(false);

    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: /Aesthetic Backgrounds/i })
    ).toBeVisible();

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

    // Wait for initial 15-card showcase preload
    await expect(page.getByText("15/15")).toBeVisible({ timeout: 15000 });

    // Multi-frame selection & dynamic ZIP pack labeling
    await page
      .getByRole("checkbox", { name: "Select frame #1", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "Select frame #2", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /Download Selected \(2\) \.ZIP/i })
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Clear selection \(2\)/i })
      .click();
    await expect(
      page.getByRole("button", { name: "Download .ZIP", exact: true })
    ).toBeVisible();

    // 9:16 Safe Zones overlay toggle
    const safeZonesBtn = page.getByRole("button", { name: "Safe Zones" });
    await safeZonesBtn.click();
    await expect(safeZonesBtn).toHaveAttribute("aria-pressed", "true");

    // Switch to 5x Mobile Fast mode and run batch fetch
    await page.getByRole("button", { name: /5x Mobile Fast/i }).click();
    await page.getByRole("button", { name: /Generate 5/i }).click();

    await expect(page.getByText("5/5")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("2/3 credits")).toBeVisible();
  });

  test("switches tabs, synthesizes voiceover with unified custom transport, and logs to Session History", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByRole("tab", { name: /Realistic Voice Studio/i }).click();
    await expect(
      page.getByText(/Drop or select WhatsApp voice note/i)
    ).toBeVisible();

    // Disable clone mode to synthesize with Kokoro-82M / fallback preset
    await page.getByRole("button", { name: /Clone Custom Voice/i }).click();
    await page
      .getByRole("button", { name: /Generate Voiceover \(Sofía\)/i })
      .click();

    await expect(page.getByText("(1/10)")).toBeVisible({ timeout: 15000 });

    // Confirm unified custom transport deck (zero native <audio controls>)
    await expect(page.locator("audio[controls]")).toHaveCount(0);
    await expect(page.locator("audio")).toHaveCount(1);
    await expect(
      page.locator('[aria-label="Interactive audio waveform scrubber"] button')
    ).toHaveCount(48);

    const speedBtn = page.getByRole("button", { name: /Playback speed:/i });
    await expect(speedBtn).toContainText("1.0x");
    await speedBtn.click();
    await expect(speedBtn).toContainText("1.15x");

    await expect(
      page.getByRole("button", { name: /Download Broadcast Audio/i })
    ).toBeVisible();
  });

  test("opens Upgrade modal, unlocks pro_client Pro Pass without exposing /admin link, and enforces /admin auth gate", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByRole("button", { name: "Upgrade" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      page.getByText(/Unlimited Aesthetic Batches & AI Voiceovers/i)
    ).toBeVisible();

    // Verify currency selector switch toggles COP vs USD headline & primary CTA
    await expect(
      dialog.getByText("$60,000 COP", { exact: true })
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: /USD · Global \(Stripe\)/i })
      .click();
    await expect(dialog.getByText("$15 USD", { exact: true })).toBeVisible();

    // Activate pro_client code and verify strict role isolation (Pro Pass visible, /admin link hidden)
    const codeInput = page.getByPlaceholder("Enter your access code...");
    await expect(codeInput).toBeVisible();
    await codeInput.fill("VOKALOOM-PRO-2026");
    await page.getByRole("button", { name: "Unlock Unlimited" }).click();

    await expect(dialog).toBeHidden({ timeout: 10000 });
    await expect(
      page.getByRole("banner").getByText("Pro Pass", { exact: true })
    ).toBeVisible();
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);

    const storedQuota = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("vokaloom_quota_v1") || "{}")
    );
    expect(storedQuota.role).toBe("pro_client");
    expect(storedQuota.isPro).toBe(true);
    expect(storedQuota.isOperator).toBe(false);

    // /admin must still require operator authentication even with pro_client entitlement cookie
    await page.goto("/admin");
    await expect(
      page.getByText("Operator Authentication Required")
    ).toBeVisible();
    await expect(page.getByLabel("Master Admin Password")).toBeVisible();
  });
});
