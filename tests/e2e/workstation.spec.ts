import { expect, test } from "@playwright/test";

test.describe("Vokaloom Studio Workbench E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test("renders desktop (1440x900) and mobile (390x844) with zero horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Vokaloom Studio" })
    ).toBeVisible();

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflow).toBe(false);

    // Toggle ES and check zero overflow
    await page.getByRole("button", { name: "ES", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: /Fondos Estéticos/i })
    ).toBeVisible();
    const desktopEsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopEsOverflow).toBe(false);

    // Switch back to EN and test mobile viewport
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("tab", { name: /Aesthetic Backgrounds/i })
    ).toBeVisible();

    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflow).toBe(false);
  });

  test("toggles 5x / 15x batch mode and fetches backgrounds", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Wait for initial 15-card showcase preload
    await expect(page.getByText("15/15")).toBeVisible({ timeout: 15000 });

    // Switch to 5x Mobile Fast mode and run batch fetch
    await page.getByRole("button", { name: /5x Mobile Fast/i }).click();
    await page.getByRole("button", { name: /Generate 5/i }).click();

    await expect(page.getByText("5/5")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("2/3 credits")).toBeVisible();
  });

  test("switches tabs, synthesizes voiceover, and logs to Session History", async ({
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
    await expect(
      page.getByRole("button", { name: /Download Broadcast Audio/i })
    ).toBeVisible();
  });

  test("opens Upgrade paywall modal and verifies /admin auth gate", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByRole("button", { name: "Upgrade" }).click();
    await expect(
      page.getByRole("dialog")
    ).toBeVisible();
    await expect(
      page.getByText(/Unlimited Aesthetic Batches & AI Voiceovers/i)
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Enter your access code...")
    ).toBeVisible();

    await page.goto("/admin");
    await expect(
      page.getByText("Operator Authentication Required")
    ).toBeVisible();
    await expect(page.getByLabel("Master Admin Password")).toBeVisible();
  });
});
