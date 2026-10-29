import { expect, test } from "@playwright/test";

test("signup delivery failure offers verification retry without claiming delivery", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-up/email", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "VERIFICATION_EMAIL_FAILED_AFTER_SIGNUP",
        message: "Your account was created, but email delivery failed.",
      }),
    }),
  );
  await page.route("**/api/auth/send-verification-email", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "VERIFICATION_EMAIL_FAILED",
        message: "Email delivery failed.",
      }),
    }),
  );
  await page.goto("/register");
  const button = page.getByRole("button", {
    name: "Create account",
    exact: true,
  });
  test.skip(
    await button.isDisabled(),
    "Authentication environment is not configured.",
  );
  await page.getByLabel("Username", { exact: true }).fill("mail_test_user");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("test@paper.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Test-password-12345");
  await button.click();
  await expect(
    page.getByRole("heading", { name: "Account created", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/We could not send the link/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check your inbox" }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Resend verification email", exact: true })
    .click();
  await expect(page.locator('.form-message[role="alert"]')).toHaveText(
    "Unable to resend right now. Try again later.",
  );
});

test("live terminal loads chart, book and native/builder catalog", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Trading desk" }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await expect(
    page.getByText("Hyperliquid connected", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Loading market history…")).toBeHidden({
    timeout: 30_000,
  });
  await expect(page.locator(".book-bids .book-row")).toHaveCount(9, {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "1h", exact: true }).click();
  await expect(page.getByText("Loading market history…")).toBeHidden({
    timeout: 30_000,
  });
  await page.screenshot({
    path: "test-results/terminal-desktop.png",
    fullPage: true,
  });
  await page.locator(".market-select").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(errors).toEqual([]);
});
test("markets search and selection navigate to the correct trading market", async ({
  page,
}) => {
  await page.goto("/markets");
  await expect(page.locator(".market-table tbody tr").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("textbox", { name: "Search markets" }).fill("ETH");
  const native = page
    .locator(".market-table tbody tr")
    .filter({ hasText: "Native perpetual" })
    .filter({ has: page.locator(".coin-title", { hasText: /^ETH$/ }) });
  await expect(native).toHaveCount(1);
  await native.getByRole("button", { name: "Trade", exact: true }).click();
  await expect(page.locator(".market-select b")).toHaveText("ETH");
  await expect(
    page.getByRole("link", { name: "Log in to trade" }),
  ).toBeVisible();
});
test("mobile panels, navigation and rules remain usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page.locator(".order-panel")).toBeVisible();
  await expect(page.locator(".chart-area")).toBeHidden();
  await page.getByRole("button", { name: "Limit", exact: true }).click();
  await expect(page.getByPlaceholder("Limit price")).toBeVisible();
  await page.getByRole("checkbox", { name: "Take profit / Stop loss" }).check();
  await expect(page.getByText("Take profit", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/terminal-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Order book", exact: true }).click();
  await expect(page.locator(".book-panel")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Portfolio", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Portfolio", exact: true }),
  ).toBeVisible();
  await page.goto("/settings#simulation");
  await expect(
    page.getByRole("heading", { name: "Simulation rules" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  await page.getByRole("button", { name: "Order book", exact: true }).click();
  await expect(page.locator(".book-panel")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("account pages and authentication explain setup without exposing secrets", async ({
  page,
  request,
}) => {
  for (const route of [
    "/portfolio",
    "/history",
    "/settings",
    "/login",
    "/register",
  ]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByText(/Password recovery is not available/),
  ).toBeVisible();
  const response = await request.get("/api/account");
  expect([401, 503]).toContain(response.status());
  const body = await response.text();
  expect(body).not.toMatch(/mysql:\/\/|password=/i);
  const mutation = await request.post("/api/trade", {
    data: { action: "reset" },
  });
  expect(mutation.status()).toBe(403);
});
