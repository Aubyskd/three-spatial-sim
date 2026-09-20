export class FixedTimeStep {
  private accumulator = 0;

  constructor(
    readonly stepSeconds = 1 / 60,
    private readonly maxFrameSeconds = 0.1,
  ) {}

  advance(frameSeconds: number, tick: (dt: number) => void): number {
    this.accumulator += Math.min(frameSeconds, this.maxFrameSeconds);
    let steps = 0;
    while (this.accumulator >= this.stepSeconds) {
      tick(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      steps += 1;
    }
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
