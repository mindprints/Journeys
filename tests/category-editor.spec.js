// @ts-check
const { test, expect } = require('@playwright/test');

const BASE   = 'http://localhost:3010';
const EDITOR = `${BASE}/category-editor.html`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openEditor(page) {
  await page.goto(EDITOR, { waitUntil: 'domcontentloaded' });
  // Wait for CategoryEditor to initialize and load config
  await page.waitForFunction(() => typeof CategoryEditor !== 'undefined', { timeout: 8000 });
  await page.waitForTimeout(600); // let loadConfig() settle
}

async function openGeneratorModal(page) {
  await page.click('#generate-category-btn');
  await page.waitForSelector('#generator-modal.active', { timeout: 5000 });
}

// ─── Page load ────────────────────────────────────────────────────────────────

test('category editor: loads without JS errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await openEditor(page);

  await expect(page.locator('#category-list')).toBeVisible();
  await expect(page.locator('#category-name')).toBeVisible();
  expect(errors).toHaveLength(0);
});

test('category editor: sidebar lists categories or shows new form', async ({ page }) => {
  await openEditor(page);

  // Either categories are loaded or the new-category form is active
  const listItems = page.locator('.category-item');
  const nameInput = page.locator('#category-name');
  const count = await listItems.count();

  if (count > 0) {
    // A category should be selected and the form populated
    await expect(nameInput).not.toHaveValue('');
  } else {
    // No categories — the form should be blank/ready for input
    await expect(nameInput).toBeVisible();
  }
});

// ─── New category ─────────────────────────────────────────────────────────────

test('new-category button: clears the form', async ({ page }) => {
  await openEditor(page);
  await page.click('#new-category-btn');

  await expect(page.locator('#category-name')).toHaveValue('');
  await expect(page.locator('#category-slug')).toHaveValue('');
  await expect(page.locator('#category-description')).toHaveValue('');
});

test('name input: auto-fills slug', async ({ page }) => {
  await openEditor(page);
  await page.click('#new-category-btn');

  await page.fill('#category-name', 'Robotic Pioneers');
  await page.locator('#category-name').dispatchEvent('input');
  await page.waitForTimeout(50);

  await expect(page.locator('#category-slug')).toHaveValue('robotic-pioneers');
});

test('color picker: updates the color chip preview', async ({ page }) => {
  await openEditor(page);

  const color = '#3b82f6';
  await page.fill('#category-color', color);
  await page.locator('#category-color').dispatchEvent('input');

  await expect(page.locator('#color-label')).toHaveText(color);
});

// ─── Generator modal ──────────────────────────────────────────────────────────

test('generator modal: opens when Generate Posters is clicked', async ({ page }) => {
  await openEditor(page);
  await openGeneratorModal(page);

  await expect(page.locator('#generator-modal')).toHaveClass(/active/);
  await expect(page.locator('#run-generator')).toBeVisible();
  await expect(page.locator('#generator-log')).toBeVisible();
});

test('generator modal: closes on Cancel', async ({ page }) => {
  await openEditor(page);
  await openGeneratorModal(page);

  await page.click('#cancel-generator');
  await expect(page.locator('#generator-modal')).not.toHaveClass(/active/);
});

test('generator modal: closes on × button', async ({ page }) => {
  await openEditor(page);
  await openGeneratorModal(page);

  await page.click('#close-generator');
  await expect(page.locator('#generator-modal')).not.toHaveClass(/active/);
});

test('generator modal: inherits topic count from category form', async ({ page }) => {
  await openEditor(page);

  // Set a target count in the main form
  await page.fill('#category-count', '5');

  await openGeneratorModal(page);

  // Generator count field should mirror what was in the category form
  await expect(page.locator('#generator-count')).toHaveValue('5');
});

test('generator modal: topic override textarea is editable', async ({ page }) => {
  await openEditor(page);
  await openGeneratorModal(page);

  await page.fill('#generator-topics', 'ENIAC\nCOLOSSUS');
  await expect(page.locator('#generator-topics')).toHaveValue('ENIAC\nCOLOSSUS');
});

test('generator modal: merge enrich checkbox is checked by default', async ({ page }) => {
  await openEditor(page);
  await openGeneratorModal(page);

  await expect(page.locator('#generator-merge')).toBeChecked();
});

// ─── Disambiguation panel ─────────────────────────────────────────────────────

test('disambig panel: hidden by default', async ({ page }) => {
  await openEditor(page);
  await openGeneratorModal(page);

  await expect(page.locator('#disambig-panel')).toBeHidden();
});

test('disambig panel: shows when API returns disambiguation status', async ({ page }) => {
  // Intercept before navigation so the handler is ready for all requests
  await page.route('**/api/preflight/topics', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          {
            topic: 'Python',
            status: 'disambiguation',
            options: [
              { title: 'Python (programming language)', slug: 'Python_(programming_language)', snippet: 'A high-level general-purpose language.' },
              { title: 'Python (snake)', slug: 'Python_(snake)', snippet: 'A genus of constricting snakes.' },
            ],
          },
        ],
      }),
    });
  });

  await openEditor(page);

  // Start fresh so source defaults to 'wikipedia' and name is empty
  await page.click('#new-category-btn');
  await page.fill('#category-name', 'Test Category');
  await page.locator('#category-name').dispatchEvent('input');

  await openGeneratorModal(page);
  // Override the topics in the modal (openGenerator() may have cleared them)
  await page.fill('#generator-topics', 'Python');
  await page.click('#run-generator');

  await expect(page.locator('#disambig-panel')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.disambig-card')).toHaveCount(1);
  await expect(page.locator('.disambig-topic-name').first()).toContainText('Python');
});

test('disambig panel: Skip & Run Anyway hides panel and proceeds', async ({ page }) => {
  await page.route('**/api/preflight/topics', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          { topic: 'Mercury', status: 'disambiguation', options: [] },
        ],
      }),
    });
  });

  // Intercept generation so the Python script doesn't actually spawn
  await page.route('**/api/run-grab', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' });
  });

  await openEditor(page);
  await page.click('#new-category-btn');
  await page.fill('#category-name', 'Test Category');
  await page.locator('#category-name').dispatchEvent('input');

  await openGeneratorModal(page);
  await page.fill('#generator-topics', 'Mercury');
  await page.click('#run-generator');

  await expect(page.locator('#disambig-panel')).toBeVisible({ timeout: 8000 });
  await page.click('#disambig-skip-btn');
  await expect(page.locator('#disambig-panel')).toBeHidden();
});

// ─── Log panel ────────────────────────────────────────────────────────────────

test('log panel: Clear Log View empties the log', async ({ page }) => {
  await openEditor(page);
  await openGeneratorModal(page);

  // Seed the log with some text via JS
  await page.evaluate(() => {
    document.getElementById('generator-log').textContent = 'Some existing log output';
  });
  await expect(page.locator('#generator-log')).not.toHaveText('');

  await page.click('#clear-log');
  await expect(page.locator('#generator-log')).toHaveText('');
});

// ─── No JS errors throughout ──────────────────────────────────────────────────

test('no JS errors opening modal, editing fields, and closing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await openEditor(page);
  await page.click('#new-category-btn');
  await page.fill('#category-name', 'Test Category');
  await page.locator('#category-name').dispatchEvent('input');

  await openGeneratorModal(page);
  await page.fill('#generator-topics', 'Topic One\nTopic Two');
  await page.click('#cancel-generator');

  expect(errors).toHaveLength(0);
});
