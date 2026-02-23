export interface DiceState {
  seed: number;
  callCount: number;
}

export class DiceRoller {
  private seed: number;
  private initialSeed: number;
  private callCount: number = 0;

  constructor(seed: number) {
    this.seed = seed;
    this.initialSeed = seed;
  }

  // Mulberry32 PRNG - fast, good distribution
  private next(): number {
    this.callCount++;
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Roll D100 (1-100)
  rollD100(): number {
    return Math.floor(this.next() * 100) + 1;
  }

  // Roll dice (e.g., 2d6+3)
  roll(dice: number, sides: number, bonus: number = 0): number {
    let total = bonus;
    for (let i = 0; i < dice; i++) {
      total += Math.floor(this.next() * sides) + 1;
    }
    return total;
  }

  // Get state for snapshot
  getState(): DiceState {
    return {
      seed: this.initialSeed,
      callCount: this.callCount,
    };
  }

  // Restore state from snapshot
  setState(state: DiceState): void {
    this.seed = state.seed;
    this.initialSeed = state.seed;
    this.callCount = 0;
    // Fast-forward to the correct state
    for (let i = 0; i < state.callCount; i++) {
      this.next();
    }
  }
}
