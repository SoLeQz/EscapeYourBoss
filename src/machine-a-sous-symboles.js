// Symboles de « Juste 5 minutes » : dessin original, style bande dessinée
// (gros contour noir, aplats), fournitures de bureau et personnages du jeu.
// Chaque symbole est un SVG 100 × 100 prêt à insérer dans une case.
const T = 'stroke="#111" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';
const svg = (corps, titre) => `<svg viewBox="0 0 100 100" role="img" aria-label="${titre}">${corps}</svg>`;
// Bandeau « WILD » commun aux deux sauvages.
const bandeau = texte => `<g transform="rotate(-6 50 82)"><rect x="16" y="72" width="68" height="20" rx="3" fill="#ff3d8b" ${T}/>
  <text x="50" y="87.5" text-anchor="middle" font-family="Bahnschrift, Arial Narrow, sans-serif" font-weight="700" font-size="17" fill="#fff" stroke="#111" stroke-width="3" paint-order="stroke" letter-spacing="1">${texte}</text></g>`;

export const DESSINS = {
  trombone: svg(`<g transform="rotate(-28 50 50)">
    <path d="M60 28v44a12 12 0 0 1-24 0V24a8 8 0 0 1 16 0v42a4 4 0 0 1-8 0V34" fill="none" stroke="#111" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M60 28v44a12 12 0 0 1-24 0V24a8 8 0 0 1 16 0v42a4 4 0 0 1-8 0V34" fill="none" stroke="#c9d4dc" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M59 34v36" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/></g>`, 'Trombone'),

  agrafeuse: svg(`<path d="M10 74a5 5 0 0 1 5-5h72a5 5 0 0 1 5 5v8H10z" fill="#3a3f45" ${T}/>
    <path d="M18 69v-8h64v8z" fill="#b8231d" ${T}/>
    <path d="M15 58 20 42q3-6 12-6h52q8 0 8 8v6q0 8-8 8H20z" fill="#e5332a" ${T}/>
    <path d="M28 41h52" stroke="#ff9b8f" stroke-width="4" stroke-linecap="round"/>
    <circle cx="22" cy="55" r="4.5" fill="#d9dde2" ${T}/>`, 'Agrafeuse'),

  postit: svg(`<g transform="rotate(7 50 50)"><path d="M18 16h64v50L66 84H18z" fill="#f7e36d" ${T}/>
    <path d="M82 66 66 84V70a4 4 0 0 1 4-4z" fill="#d9c24a" ${T}/>
    <text x="48" y="45" text-anchor="middle" font-family="Ink Free, Segoe Print, cursive" font-size="17" fill="#1f4fbf">partir</text>
    <text x="46" y="66" text-anchor="middle" font-family="Ink Free, Segoe Print, cursive" font-size="19" font-weight="700" fill="#d9412b">18h !!</text></g>`, 'Post-it'),

  tasse: svg(`<path d="M34 16c-4 5 4 7 0 12M48 12c-4 6 4 8 0 14M62 16c-4 5 4 7 0 12" fill="none" stroke="#e8e2d6" stroke-width="4" stroke-linecap="round"/>
    <path d="M70 44h6a11 11 0 0 1 0 22h-6" fill="none" stroke="#111" stroke-width="12"/><path d="M70 44h6a11 11 0 0 1 0 22h-6" fill="none" stroke="#fff" stroke-width="5"/>
    <path d="M22 34h50v36a12 12 0 0 1-12 12H34a12 12 0 0 1-12-12z" fill="#fff" ${T}/>
    <ellipse cx="47" cy="34" rx="25" ry="6" fill="#5b3a22" ${T}/>
    <rect x="22" y="50" width="50" height="14" fill="#d9412b" stroke="#111" stroke-width="3"/>
    <text x="47" y="61.5" text-anchor="middle" font-family="Bahnschrift, Arial Narrow, sans-serif" font-weight="700" font-size="12" fill="#fff">N°1</text>`, 'Tasse de café'),

  tampon: svg(`<g transform="rotate(-10 58 76)"><rect x="30" y="64" width="58" height="22" rx="2" fill="none" stroke="#d9412b" stroke-width="4"/>
    <text x="59" y="81" text-anchor="middle" font-family="Bahnschrift, Arial Narrow, sans-serif" font-weight="700" font-size="16" fill="#d9412b" letter-spacing="1">URGENT</text></g>
    <circle cx="38" cy="18" r="11" fill="#9a5a2c" ${T}/>
    <path d="M32 27h12l3 14H29z" fill="#7a4520" ${T}/>
    <rect x="16" y="41" width="44" height="14" rx="2" fill="#3a3f45" ${T}/>
    <rect x="19" y="55" width="38" height="6" fill="#d9412b" stroke="#111" stroke-width="3"/>
    <circle cx="34" cy="14" r="3" fill="#d49a66"/>`, 'Tampon URGENT'),

  cravate: svg(`<path d="M26 10 50 22 74 10 70 26 50 30 30 26z" fill="#f2efe6" ${T}/>
    <path d="M42 24h16l-3 12h-10z" fill="#2c57c9" ${T}/>
    <path d="M45 36h10l9 38-14 16-14-16z" fill="#2c57c9" ${T}/>
    <path d="M47 46 58 40M44 60 61 50M45 74 63 64" stroke="#ffd23a" stroke-width="4.5" stroke-linecap="round"/>`, 'Cravate'),

  portable: svg(`<path d="M20 18h60a4 4 0 0 1 4 4v42H16V22a4 4 0 0 1 4-4z" fill="#3a3f45" ${T}/>
    <rect x="22" y="24" width="56" height="34" fill="#e9f5ec" stroke="#111" stroke-width="2.5"/>
    <path d="M22 32h56M22 40h56M22 48h56M36 24v34M50 24v34M64 24v34" stroke="#3aa76d" stroke-width="2"/>
    <rect x="36" y="32" width="14" height="8" fill="#ffd23a"/>
    <path d="M8 66h84l-6 12H14z" fill="#c9d0d6" ${T}/>
    <path d="M40 71h20" stroke="#111" stroke-width="3" stroke-linecap="round"/>`, 'Ordinateur'),

  badge: svg(`<path d="M42 4h16l-2 18H44z" fill="#d9412b" ${T}/>
    <rect x="18" y="20" width="64" height="72" rx="6" fill="#fff" ${T}/>
    <path d="M18 26a6 6 0 0 1 6-6h52a6 6 0 0 1 6 6v10H18z" fill="#234b49" stroke="#111" stroke-width="5" stroke-linejoin="round"/>
    <rect x="42" y="23" width="16" height="6" rx="3" fill="#111"/>
    <rect x="28" y="44" width="22" height="26" fill="#dfe6e5" stroke="#111" stroke-width="3"/>
    <circle cx="39" cy="54" r="5.5" fill="#f1c096" stroke="#111" stroke-width="2.5"/>
    <path d="M31 69c1-6 15-6 16 0" fill="#4c5464" stroke="#111" stroke-width="2.5"/>
    <path d="M56 48h16M56 56h14M56 64h10" stroke="#111" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M28 80h44" stroke="#111" stroke-width="4" stroke-dasharray="3 3"/>`, 'Badge d’accès'),

  directeur: svg(`<circle cx="50" cy="50" r="46" fill="#d9412b"/>
    <g fill="#ff6a50">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<path d="M50 50 L${50 + 46 * Math.cos(i * Math.PI / 4)} ${50 + 46 * Math.sin(i * Math.PI / 4)} L${50 + 46 * Math.cos(i * Math.PI / 4 + .3)} ${50 + 46 * Math.sin(i * Math.PI / 4 + .3)}z"/>`).join('')}</g>
    <path d="M18 98c2-18 16-24 32-24s30 6 32 24z" fill="#2b3140" ${T}/>
    <path d="M43 75h14l-3 12h-8z" fill="#6e2b33" stroke="#111" stroke-width="3.5"/>
    <ellipse cx="50" cy="46" rx="22" ry="25" fill="#e6b288" ${T}/>
    <path d="M28 40q2-18 22-19 20 1 22 19-4-9-9-10-6 5-26 2-6 2-9 8z" fill="#2a2320" ${T}/>
    <circle cx="41" cy="48" r="7" fill="#fff" stroke="#111" stroke-width="3.5"/><circle cx="59" cy="48" r="7" fill="#fff" stroke="#111" stroke-width="3.5"/>
    <path d="M48 48h4" stroke="#111" stroke-width="3.5"/>
    <circle cx="42" cy="49" r="2.4" fill="#111"/><circle cx="58" cy="49" r="2.4" fill="#111"/>
    <path d="M33 38l14 4M67 38l-14 4" stroke="#111" stroke-width="4" stroke-linecap="round"/>
    <path d="M38 62q12-7 24 0-12-2-24 0z" fill="#2a2320" stroke="#111" stroke-width="3"/>
    <path d="M42 68q8-4 16 0" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round"/>`, 'Le directeur'),

  sauvage: svg(`<path d="M26 22a12 12 0 0 1 16-6M74 22a12 12 0 0 0-16-6" fill="#ffd23a" ${T}/>
    <path d="M30 80 22 90M70 80l8 10" ${T}/>
    <circle cx="50" cy="50" r="33" fill="#e5332a" ${T}/>
    <circle cx="50" cy="50" r="25" fill="#fffdf4" stroke="#111" stroke-width="3.5"/>
    <text x="50" y="62" text-anchor="middle" font-family="Bahnschrift, Arial Narrow, sans-serif" font-weight="700" font-size="34" fill="#111">5</text>
    <path d="M50 50V31M50 50l13 7" stroke="#d9412b" stroke-width="3.5" stroke-linecap="round" opacity=".85"/>
    <text x="50" y="41" text-anchor="middle" font-family="Bahnschrift, Arial Narrow, sans-serif" font-weight="700" font-size="8" fill="#6f7875">MIN</text>
    ${bandeau('WILD')}`, 'Réveil 5 minutes, sauvage'),

  canard: svg(`<path d="M16 54c0 18 15 30 36 30 21 0 32-12 30-30-1-6-10-7-17-3-8 4-21 4-30 0-9-4-19-3-19 3z" fill="#ffd21f" ${T}/>
    <circle cx="52" cy="30" r="17" fill="#ffd21f" ${T}/>
    <path d="M66 28 86 32 67 40z" fill="#ff8a1c" ${T}/>
    <circle cx="56" cy="25" r="3.5" fill="#111"/><circle cx="57" cy="24" r="1.2" fill="#fff"/>
    <path d="M30 58q10 8 26 2" fill="none" stroke="#e8b400" stroke-width="4" stroke-linecap="round"/>
    ${bandeau('WILD')}`, 'Canard multiplicateur, sauvage'),

  sortie: svg(`<rect x="6" y="14" width="88" height="72" rx="4" fill="#e6e9e3" ${T}/>
    <rect x="13" y="21" width="74" height="58" fill="#14a052" stroke="#0b4f2a" stroke-width="3"/>
    <g transform="translate(18 24) scale(2.05)" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 7.2 11.2 13.2M13.6 8l3.2 2.2 2.6-1M13.2 8.2 10 9l-2.2 2.6M11.2 13.2l3.6 2.6-.8 4.8M11.2 13.2l-2.6 3.6-4 .6"/></g>
    <circle cx="49.8" cy="31.8" r="4.5" fill="#fff"/>
    <path d="M62 50h16M72 44l6 6-6 6" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="99" text-anchor="middle" font-family="Bahnschrift, Arial Narrow, sans-serif" font-weight="700" font-size="15" fill="#fff" stroke="#111" stroke-width="3.5" paint-order="stroke" letter-spacing="2">SORTIE</text>`, 'Sortie de secours, bonus'),
};
