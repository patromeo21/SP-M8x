import { ConditionalTrig } from './stepTypes';

export function evaluateTrig(
  trig: ConditionalTrig,
  currentCycle: number, // 0-indexed loop or bar cycle counter
  isFillActive: boolean
): boolean {
  // 1. Fill-only check
  if (trig.fillOnly && !isFillActive) {
    return false;
  }

  // 2. Probability check (0–100%)
  if (trig.probability !== undefined && trig.probability < 100) {
    if (Math.random() * 100 >= trig.probability) {
      return false;
    }
  }

  // 3. Cycle condition check (e.g., "1:2", "2:4")
  if (trig.cycleCondition && trig.cycleCondition.includes(':')) {
    const [matchCount, totalCycles] = trig.cycleCondition.split(':').map(Number);
    if (!isNaN(matchCount) && !isNaN(totalCycles) && totalCycles > 0) {
      const activeCycleInPeriod = (currentCycle % totalCycles) + 1;
      if (activeCycleInPeriod !== matchCount) {
        return false;
      }
    }
  }

  return true;
}