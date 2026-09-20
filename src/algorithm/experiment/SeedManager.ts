/** Mulberry32 PRNG: compact, deterministic and sufficient for repeatable baseline experiments. */
export class SeedManager {
  private state: number;
  constructor(readonly seed: number) { this.state = seed >>> 0; }
  reset(): void { this.state = this.seed >>> 0; }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
}
