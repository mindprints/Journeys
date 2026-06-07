// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3010';
const EDITOR = `${BASE}/unified-editor.html`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Open the editor, click New Poster, navigate to the Back Side tab */
async function openLinksTab(page) {
    await page.goto(EDITOR, { waitUntil: 'domcontentloaded' });
    // Wait for poster list to finish loading
    await page.waitForFunction(() => window.editor && window.editor.posters !== undefined, { timeout: 8000 });
    // Click New Poster
    await page.click('#new-poster-btn');
    // Fill title so saves work
    await page.fill('#front-title', '__pw_test__');
    // Switch to Back Side tab (links live there)
    await page.click('[data-tab="back"]');
    await page.waitForSelector('#add-link-btn', { state: 'visible' });
}

/** Add a link by clicking the "Add Link" button */
async function clickAddLink(page) {
    await page.click('#add-link-btn');
    await page.waitForTimeout(80);
}

/** Nth .link-item (0-based) */
const linkItem = (page, n) => page.locator('.link-item').nth(n);

// ─── Layout ───────────────────────────────────────────────────────────────────

test('link-item: type select and url input are on the same row', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await openLinksTab(page);
    await clickAddLink(page);

    const item = linkItem(page, 0);
    const typeBox = await item.locator('.link-type').boundingBox();
    const urlBox = await item.locator('.link-url').boundingBox();

    expect(typeBox).not.toBeNull();
    expect(urlBox).not.toBeNull();
    // Type select and URL input on same baseline (within 10px)
    expect(Math.abs(typeBox.y - urlBox.y)).toBeLessThan(10);
    expect(errors).toHaveLength(0);
});

test('link-item: all controls visible and not squashed', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);

    const item = linkItem(page, 0);
    await expect(item.locator('.link-type')).toBeVisible();
    await expect(item.locator('.link-url')).toBeVisible();
    await expect(item.locator('.link-label')).toBeVisible();
    await expect(item.locator('.link-primary')).toBeVisible();
    await expect(item.locator('button.danger')).toBeVisible();

    // URL input should have meaningful width (not squashed)
    const urlBox = await item.locator('.link-url').boundingBox();
    expect(urlBox.width).toBeGreaterThan(60);

    // Label input should have meaningful width
    const labelBox = await item.locator('.link-label').boundingBox();
    expect(labelBox.width).toBeGreaterThan(60);
});

// ─── Browse button visibility ──────────────────────────────────────────────────

test('browse button: hidden for external type', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-type').selectOption('external');
    await expect(item.locator('.link-browse-btn')).toBeHidden();
});

test('browse button: hidden for internal type', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-type').selectOption('internal');
    await expect(item.locator('.link-browse-btn')).toBeHidden();
});

test('browse button: visible for file type', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-type').selectOption('file');
    await expect(item.locator('.link-browse-btn')).toBeVisible();
});

test('browse button: visible for app type', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-type').selectOption('app');
    await expect(item.locator('.link-browse-btn')).toBeVisible();
});

test('browse button: toggles correctly when type changes', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);

    await item.locator('.link-type').selectOption('file');
    await expect(item.locator('.link-browse-btn')).toBeVisible();

    await item.locator('.link-type').selectOption('external');
    await expect(item.locator('.link-browse-btn')).toBeHidden();

    await item.locator('.link-type').selectOption('app');
    await expect(item.locator('.link-browse-btn')).toBeVisible();

    await item.locator('.link-type').selectOption('internal');
    await expect(item.locator('.link-browse-btn')).toBeHidden();
});

// ─── collectLinks field mapping ───────────────────────────────────────────────

test('external link: saves url field, not target/path/command', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-type').selectOption('external');
    await item.locator('.link-url').fill('https://example.com/page?a=1&b=2');
    await item.locator('.link-label').fill('Example');

    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('external');
    expect(links[0].url).toBe('https://example.com/page?a=1&b=2');
    expect(links[0].target).toBeUndefined();
    expect(links[0].path).toBeUndefined();
    expect(links[0].command).toBeUndefined();
});

test('internal link: saves target field, not url/path/command', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-type').selectOption('internal');
    await item.locator('.link-url').fill('ai_posters/ai_Sentient_Machines.json');
    await item.locator('.link-label').fill('Sentient Machines');

    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('internal');
    expect(links[0].target).toBe('ai_posters/ai_Sentient_Machines.json');
    expect(links[0].url).toBeUndefined();
    expect(links[0].path).toBeUndefined();
});

test('file link: saves path field', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-type').selectOption('file');
    await item.locator('.link-url').fill('C:\\Users\\mindp\\notes.txt');
    await item.locator('.link-label').fill('Notes');

    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('file');
    expect(links[0].path).toBe('C:\\Users\\mindp\\notes.txt');
    expect(links[0].url).toBeUndefined();
});

test('app link: saves command field', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-type').selectOption('app');
    await item.locator('.link-url').fill('notepad.exe');
    await item.locator('.link-label').fill('Notepad');

    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('app');
    expect(links[0].command).toBe('notepad.exe');
    expect(links[0].url).toBeUndefined();
});

test('primary checkbox: sets primary:true', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-url').fill('https://example.com');
    await item.locator('.link-label').fill('Ex');
    await item.locator('.link-primary').check();

    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links[0].primary).toBe(true);
});

test('link without label: excluded from collectLinks', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-url').fill('https://example.com');

    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links).toHaveLength(0);
});

test('link without url: excluded from collectLinks', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    const item = linkItem(page, 0);
    await item.locator('.link-label').fill('Label only');

    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links).toHaveLength(0);
});

// ─── Remove link ──────────────────────────────────────────────────────────────

test('remove button: deletes the correct link item', async ({ page }) => {
    await openLinksTab(page);
    await clickAddLink(page);
    await clickAddLink(page);
    expect(await page.locator('.link-item').count()).toBe(2);

    await linkItem(page, 0).locator('button.danger').click();
    expect(await page.locator('.link-item').count()).toBe(1);
});

// ─── loadLinks round-trip ─────────────────────────────────────────────────────

test('loadLinks: populates all fields correctly', async ({ page }) => {
    await openLinksTab(page);

    await page.evaluate(() => {
        window.editor.loadLinks([
            { type: 'external', url: 'https://openai.com', label: 'OpenAI', primary: true },
            { type: 'internal', target: 'ai_posters/ai_Sentient_Machines.json', label: 'Sentient' },
            { type: 'file', path: 'C:\\notes.txt', label: 'Notes' },
            { type: 'app', command: 'notepad.exe', label: 'Notepad' },
        ]);
    });

    expect(await page.locator('.link-item').count()).toBe(4);

    await expect(linkItem(page, 0).locator('.link-type')).toHaveValue('external');
    await expect(linkItem(page, 0).locator('.link-url')).toHaveValue('https://openai.com');
    await expect(linkItem(page, 0).locator('.link-label')).toHaveValue('OpenAI');
    await expect(linkItem(page, 0).locator('.link-primary')).toBeChecked();

    await expect(linkItem(page, 1).locator('.link-type')).toHaveValue('internal');
    await expect(linkItem(page, 1).locator('.link-url')).toHaveValue('ai_posters/ai_Sentient_Machines.json');

    await expect(linkItem(page, 2).locator('.link-type')).toHaveValue('file');
    await expect(linkItem(page, 2).locator('.link-url')).toHaveValue('C:\\notes.txt');

    await expect(linkItem(page, 3).locator('.link-type')).toHaveValue('app');
    await expect(linkItem(page, 3).locator('.link-url')).toHaveValue('notepad.exe');
});

// ─── Special characters ───────────────────────────────────────────────────────

test('URL with & round-trips without HTML corruption', async ({ page }) => {
    await openLinksTab(page);
    await page.evaluate(() => {
        window.editor.loadLinks([
            { type: 'external', url: 'https://example.com/?foo=1&bar=2&baz=3', label: 'Amps' }
        ]);
    });

    // Input value must be the raw URL, not HTML-encoded
    await expect(linkItem(page, 0).locator('.link-url')).toHaveValue('https://example.com/?foo=1&bar=2&baz=3');

    // collectLinks must return the raw URL too
    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links[0].url).toBe('https://example.com/?foo=1&bar=2&baz=3');
});

test('path with backslashes round-trips correctly', async ({ page }) => {
    await openLinksTab(page);
    await page.evaluate(() => {
        window.editor.loadLinks([
            { type: 'file', path: 'C:\\Program Files\\Notepad++\\notepad++.exe', label: 'Npp' }
        ]);
    });

    await expect(linkItem(page, 0).locator('.link-url')).toHaveValue('C:\\Program Files\\Notepad++\\notepad++.exe');

    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links[0].path).toBe('C:\\Program Files\\Notepad++\\notepad++.exe');
});

// ─── Gallery rendering ────────────────────────────────────────────────────────

test('gallery: internal links use data-target (not inline string literal)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    // Wait briefly for posters to render
    await page.waitForTimeout(2000);

    const internalLinks = await page.locator('a.v2-link[data-target]').all();
    for (const link of internalLinks) {
        const onclick = await link.getAttribute('onclick');
        expect(onclick).toContain('this.dataset.target');
    }

    const externalLinks = await page.locator('a.v2-link[data-url]').all();
    for (const link of externalLinks) {
        const onclick = await link.getAttribute('onclick');
        expect(onclick).toContain('this.dataset.url');
    }

    expect(errors).toHaveLength(0);
});

// ─── Preview icon ─────────────────────────────────────────────────────────────

test('preview: app link shows fa-terminal icon', async ({ page }) => {
    await openLinksTab(page);
    await page.evaluate(() => {
        window.editor.loadLinks([
            { type: 'app', command: 'notepad.exe', label: 'Notepad' },
        ]);
    });

    await page.evaluate(() => window.editor.updatePreview?.());
    await page.waitForTimeout(400);

    // The preview panel should use fa-terminal for app type
    const previewLinks = page.locator('.poster-preview .v2-link, #preview-area .v2-link');
    const count = await previewLinks.count();
    if (count > 0) {
        const icon = previewLinks.first().locator('i');
        await expect(icon).toHaveClass(/fa-terminal/);
    }
});

// ─── No JS errors throughout ──────────────────────────────────────────────────

test('no JS errors when exercising all link types', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await openLinksTab(page);

    for (const type of ['external', 'internal', 'file', 'app']) {
        await clickAddLink(page);
        const item = page.locator('.link-item').last();
        await item.locator('.link-type').selectOption(type);
        await item.locator('.link-url').fill('https://example.com');
        await item.locator('.link-label').fill(type + '_label');
    }

    const links = await page.evaluate(() => window.editor.collectLinks());
    expect(links).toHaveLength(4);
    expect(errors).toHaveLength(0);
});
