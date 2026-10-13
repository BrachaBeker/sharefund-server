// The API speaks shekels (for example 20.5), the database stores whole agorot (2050).

export function toAgorot(shekels: number): number {
  return Math.round(shekels * 100);
}

export function toShekels(agorot: number): number {
  return agorot / 100;
}

/** true when the number has at most two digits after the decimal point */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}
