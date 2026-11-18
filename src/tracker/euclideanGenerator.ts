const MAX_STEPS = 256;

export function generateEuclideanSteps(steps: number, pulses: number, rotation: number = 0): boolean[] {
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > MAX_STEPS) {
    throw new RangeError(`Euclidean steps must be a safe integer between 1 and ${MAX_STEPS}, received: ${steps}`);
  }
  if (!Number.isSafeInteger(pulses) || pulses < 0 || pulses > steps) {
    throw new RangeError(`Euclidean pulses must be a safe integer between 0 and steps (${steps}), received: ${pulses}`);
  }
  if (!Number.isSafeInteger(rotation)) {
    throw new TypeError(`Euclidean rotation must be a safe integer, received: ${rotation}`);
  }

  if (pulses === 0) return Array(steps).fill(false);
  if (pulses >= steps) return Array(steps).fill(true);

  const pattern = new Array<boolean>(steps);
  let bucket = 0;

  for (let i = 0; i < steps; i++) {
    bucket += pulses;
    if (bucket >= steps) {
      bucket -= steps;
      pattern[i] = true;
    } else {
      pattern[i] = false;
    }
  }

  const normRot = ((rotation % steps) + steps) % steps;
  if (normRot === 0) return pattern;

  return pattern.slice(-normRot).concat(pattern.slice(0, steps - normRot));
}