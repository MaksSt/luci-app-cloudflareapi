'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { mountView } = require('./fixture');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'htdocs/luci-static/resources/view/cloudflareapi/overview.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'htdocs/luci-static/resources/view/cloudflareapi/overview.css'), 'utf8');
const output = path.join(__dirname, 'screenshots');

async function main() {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: true });
    let checked = 0;
    try {
        for (const colorScheme of ['light', 'dark']) {
            for (const width of [320, 390, 600, 768, 1024, 1440]) {
                const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.route('**/*', route => { errors.push('Unexpected network request: ' + route.request().url()); return route.abort(); });
                const mount = async scenario => {
                    await page.evaluate(({ source, css, scenario, fn }) => {
                        new Function('return (' + fn + ')')()(source, css, scenario);
                    }, { source, css, scenario, fn: mountView.toString() });
                };
                async function layout(state) {
                    const problems = await page.evaluate(() => {
                        const issues = [];
                        const viewport = document.documentElement.clientWidth;
                        if (document.documentElement.scrollWidth > viewport + 1) issues.push('Page scrolls horizontally');
                        for (const el of document.querySelectorAll('.cf-app input, .cf-app button, .cf-panel, .cf-table td')) {
                            const r = el.getBoundingClientRect();
                            if (r.width && (r.left < -1 || r.right > viewport + 1)) issues.push(el.tagName + ' outside viewport');
                            if (el.matches('button') && (r.height < 44 || r.width < 44)) issues.push('Small button');
                        }
                        for (const el of document.querySelectorAll('.cf-app input')) {
                            if (!el.labels.length && !el.getAttribute('aria-label')) issues.push('Input without accessible name');
                        }
                        return issues;
                    });
                    assert.deepEqual(problems, [], `${width}/${colorScheme}/${state}`);
                    checked++;
                }
                await mount('populated');
                await layout('selected');
                await page.getByText('Cloudflare API Token', { exact: true }).click();
                assert.equal(await page.locator('#cf-token').evaluate(el => el === document.activeElement), true);
                await page.locator('#cf-hour').fill('7');
                await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
                assert.equal(await page.evaluate(() => testState.settings.check_hour), '7');
                await page.getByRole('button', { name: 'Загрузить зоны', exact: true }).click();
                await page.getByRole('button', { name: 'Показать A-записи', exact: true }).first().waitFor();
                await page.getByRole('button', { name: 'Показать A-записи', exact: true }).first().click();
                await page.getByRole('table', { name: 'A-записи зоны example.com', exact: true }).waitFor();
                assert.equal(await page.getByText('ignored.example.com', { exact: true }).count(), 0);
                await layout('expanded');
                const available = page.getByRole('table', { name: 'A-записи зоны example.com', exact: true });
                await available.getByRole('checkbox').nth(1).check();
                assert.equal(await page.evaluate(() => testState.records.length), 3);
                await available.getByRole('checkbox').nth(1).uncheck();
                assert.equal(await page.evaluate(() => testState.records.length), 2);
                if (width === 390 || width === 1440) await page.screenshot({ path: path.join(output, `${colorScheme}-${width}-expanded.png`), fullPage: true });
                await page.getByRole('button', { name: 'Удалить запись home.example.com', exact: true }).click();
                assert.equal(await page.evaluate(() => testState.records.length), 1);
                await page.locator('#cf-token').focus();
                await page.keyboard.press('Tab');
                assert.equal(await page.locator('#cf-ip-url').evaluate(el => el === document.activeElement), true);
                assert.notEqual(await page.locator('#cf-ip-url').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
                await mount('empty');
                await page.getByRole('button', { name: 'Загрузить зоны', exact: true }).click();
                await page.getByText('Cloudflare зоны не найдены', { exact: true }).waitFor();
                await layout('empty');
                if (width === 390 || width === 1440) await page.screenshot({ path: path.join(output, `${colorScheme}-${width}-empty.png`), fullPage: true });
                await mount('loading');
                await page.getByRole('button', { name: 'Загрузить зоны', exact: true }).click();
                await page.getByText('Загрузка зон Cloudflare...', { exact: true }).waitFor();
                await layout('loading');
                if (width === 390 || width === 1440) await page.screenshot({ path: path.join(output, `${colorScheme}-${width}-loading.png`), fullPage: true });
                await mount('error');
                await page.getByRole('button', { name: 'Загрузить зоны', exact: true }).click();
                await page.getByRole('alert').waitFor();
                await layout('error');
                if (width === 390 || width === 1440) await page.screenshot({ path: path.join(output, `${colorScheme}-${width}-error.png`), fullPage: true });
                assert.deepEqual(errors, [], `${width}/${colorScheme}: browser errors`);
                await page.close();
            }
        }
        console.log(`Responsive UI: ${checked} layout/state checks passed; save, selection, removal, labels and keyboard verified.`);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
