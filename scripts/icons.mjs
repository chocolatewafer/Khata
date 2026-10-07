// Renders the logo to every icon size the web app needs. Run with `npm run icons`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

/** The cup, drawn on a 512 grid. `scale` shrinks it toward the centre (maskable icons need a safe zone). */
const cup = (scale = 1, ink = '#f5e6d3', crema = '#c98a4b', steam = '#f5e6d3') => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <g fill="none" stroke="${steam}" stroke-width="18" stroke-linecap="round" opacity="0.85">
      <path d="M206 168c-18-22 18-38 0-62"/>
      <path d="M256 158c-18-22 18-38 0-62"/>
      <path d="M306 168c-18-22 18-38 0-62"/>
    </g>
    <path d="M140 214h232v54c0 72-52 122-116 122s-116-50-116-122z" fill="${ink}"/>
    <path d="M372 236h18c30 0 48 20 48 44s-18 46-48 46h-30" fill="none" stroke="${ink}" stroke-width="22" stroke-linecap="round"/>
    <ellipse cx="256" cy="216" rx="116" ry="20" fill="${crema}"/>
    <path d="M104 408h304" stroke="${ink}" stroke-width="22" stroke-linecap="round"/>
  </g>`;

const bg = (rx) => `
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#7a5539"/><stop offset="1" stop-color="#3a2618"/>
  </linearGradient></defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`;

const icon = svg(bg(112) + cup(0.92));
const maskable = svg(bg(0) + cup(0.7));
// Android status-bar badge: white silhouette, only the alpha channel is used
const badge = svg(cup(1, '#fff', '#fff', '#fff'));

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/favicon.svg', icon);
const png = (src, size, out) => writeFileSync(out, new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng());
png(icon, 32, 'public/icons/favicon-32.png');
png(icon, 192, 'public/icons/icon-192.png');
png(icon, 512, 'public/icons/icon-512.png');
png(maskable, 192, 'public/icons/maskable-192.png');
png(maskable, 512, 'public/icons/maskable-512.png');
png(svg(bg(0) + cup(0.8)), 180, 'public/icons/apple-touch-icon.png');
png(badge, 96, 'public/icons/badge.png');

// 1200×630 link-preview card (Open Graph / Twitter). Rendered with a system font, then committed as a PNG.
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bgc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#211915"/><stop offset="1" stop-color="#130d0b"/></linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.7"><stop offset="0" stop-color="#ffb59a" stop-opacity="0.28"/><stop offset="1" stop-color="#ffb59a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bgc)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(96 155) scale(0.625)">${bg(112)}${cup(0.92)}</g>
  <g font-family="Segoe UI, Inter, Helvetica, Arial, sans-serif">
    <text x="476" y="270" font-size="104" font-weight="700" fill="#f7ebe4" letter-spacing="-3">Khata</text>
    <text x="480" y="340" font-size="38" font-weight="500" fill="#ffb59a">Expense tracker for India and Nepal</text>
    <text x="480" y="410" font-size="30" fill="#f7ebe4" fill-opacity="0.66">Log a purchase in two taps. Reads bank and</text>
    <text x="480" y="452" font-size="30" fill="#f7ebe4" fill-opacity="0.66">wallet SMS. Private, offline, no account.</text>
  </g>
  <rect x="96" y="540" width="1008" height="1" fill="#f7ebe4" fill-opacity="0.12"/>
  <text x="96" y="584" font-family="Segoe UI, Inter, Helvetica, Arial, sans-serif" font-size="24" fill="#f7ebe4" fill-opacity="0.5">chocolatewafer.github.io/Khata</text>
</svg>`;
writeFileSync('public/social-card.png', new Resvg(card, { font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng());
console.log('icons and social card written to public/');
