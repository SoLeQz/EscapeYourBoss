// materials.js peint ses textures sur des <canvas>, donc sur un DOM que
// Node n'a pas. Le bouchon rend juste assez de surface pour que la
// génération tourne : les pixels ne sont jamais lus par ce test, qui
// vérifie la géométrie et l'assemblage, pas les matières.
const ctx2d = {
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(4 * w * (h ?? w)), width: w, height: h ?? w }),
  putImageData() {},
  fillRect() {}, fillText() {}, strokeText() {}, beginPath() {}, moveTo() {},
  lineTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  measureText: () => ({ width: 10 }),
};
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }),
};
globalThis.performance ??= { now: () => Date.now() };
