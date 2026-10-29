// Renders cv-en.html and cv-es.html to the PDFs served from public/cv/.
// Needs Playwright with Chromium installed: `node cv/render.mjs`. Loaded with
// require so a global install (found through NODE_PATH) works too.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const dir = new URL('./', import.meta.url);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const lang of ['en', 'es']) {
	await page.goto(new URL(`cv-${lang}.html`, dir).href);
	await page.pdf({
		path: fileURLToPath(new URL(`../public/cv/guillermo-sanchez-cv-${lang}.pdf`, dir)),
		format: 'A4',
		preferCSSPageSize: true,
		printBackground: true
	});
}
await browser.close();
