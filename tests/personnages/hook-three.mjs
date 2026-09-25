const VENDOR = new URL('../../vendor/', import.meta.url);
const ADDONS = 'three/addons/';

export async function resolve(specifier, context, next) {
  if (specifier === 'three')
    return { url: new URL('three.module.js', VENDOR).href, shortCircuit: true };
  if (specifier.startsWith(ADDONS))
    return { url: new URL('jsm/' + specifier.slice(ADDONS.length), VENDOR).href, shortCircuit: true };
  return next(specifier, context);
}
