import type { BankId } from '../project/projectController';

export function padIdToInstrumentId(padId: string): number | null {
  const match = /^([A-D])([1-9]|1[0-6])$/.exec(padId);
  return match ? (match[1].charCodeAt(0) - 65) * 16 + Number(match[2]) - 1 : null;
}

export function instrumentIdToPadId(instrumentId: number | null): string | null {
  if (instrumentId === null || !Number.isInteger(instrumentId) || instrumentId < 0 || instrumentId >= 64) return null;
  const bank = String.fromCharCode(65 + Math.floor(instrumentId / 16)) as BankId;
  return `${bank}${instrumentId % 16 + 1}`;
}
