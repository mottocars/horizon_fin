#!/usr/bin/env node
// Gera public/og.png (1200x630, imagem de compartilhamento) a partir de og/og.html.
// Uso: node scripts/og.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(path.join(SITE, 'og/og.html')).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(SITE, 'public/og.png') });
await browser.close();
console.log('gerado      public/og.png');
