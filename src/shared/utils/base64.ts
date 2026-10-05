/** React Native–safe base64 helpers (no Node Buffer required). */
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

type GlobalB64 = {btoa?: (data: string) => string; atob?: (data: string) => string};

export function encodeBase64(input: string): string {
  const g = globalThis as unknown as GlobalB64;
  if (typeof g.btoa === 'function') {
    return g.btoa(input);
  }
  let output = '';
  let i = 0;
  while (i < input.length) {
    const a = input.charCodeAt(i++);
    const b = i < input.length ? input.charCodeAt(i++) : NaN;
    const c = i < input.length ? input.charCodeAt(i++) : NaN;
    const bitmap = (a << 16) | ((Number.isNaN(b) ? 0 : b) << 8) | (Number.isNaN(c) ? 0 : c);
    output +=
      chars.charAt((bitmap >> 18) & 63) +
      chars.charAt((bitmap >> 12) & 63) +
      (Number.isNaN(b) ? '=' : chars.charAt((bitmap >> 6) & 63)) +
      (Number.isNaN(c) ? '=' : chars.charAt(bitmap & 63));
  }
  return output;
}

export function decodeBase64(input: string): string {
  const g = globalThis as unknown as GlobalB64;
  if (typeof g.atob === 'function') {
    return g.atob(input);
  }
  const str = input.replace(/=+$/, '');
  let output = '';
  let i = 0;
  while (i < str.length) {
    const enc1 = chars.indexOf(str.charAt(i++));
    const enc2 = chars.indexOf(str.charAt(i++));
    const enc3 = chars.indexOf(str.charAt(i++));
    const enc4 = chars.indexOf(str.charAt(i++));
    const bitmap = (enc1 << 18) | (enc2 << 12) | ((enc3 & 63) << 6) | (enc4 & 63);
    output += String.fromCharCode((bitmap >> 16) & 255);
    if (enc3 !== 64 && enc3 !== -1 && str.charAt(i - 2) !== '=') {
      output += String.fromCharCode((bitmap >> 8) & 255);
    }
    if (enc4 !== 64 && enc4 !== -1 && str.charAt(i - 1) !== '=') {
      output += String.fromCharCode(bitmap & 255);
    }
  }
  return output;
}
