import { BANKS, PADS_PER_BANK, type PadBankApi } from './usePadBank';
import type { BankId } from '../project/projectController';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}

export async function chopToBankReplacingSingleSource(
  padBank: PadBankApi,
  padId: string,
  bank: BankId,
  count: number,
): Promise<string[]> {
  const source = padBank.slots[padId];
  const occupiedInBank = Array.from({ length: PADS_PER_BANK }, (_, index) => padBank.slots[`${bank}${index + 1}`])
    .filter((slot) => slot !== undefined && slot.sampleKey !== null);
  if (count !== PADS_PER_BANK || !source || source.sampleKey === null || source.id[0] !== bank ||
      occupiedInBank.length !== 1 || occupiedInBank[0]?.id !== padId) {
    return padBank.chopToBank(padId, bank, count);
  }

  const stagingPad = BANKS.filter((candidate) => candidate !== bank)
    .flatMap((candidate) => Array.from({ length: PADS_PER_BANK }, (_, index) => padBank.slots[`${candidate}${index + 1}`]))
    .find((slot) => slot?.sampleKey === null);
  if (!stagingPad) throw new Error(`Cannot replace the full bank: no empty temporary pad is available outside bank ${bank}.`);

  await padBank.copyPad(padId, stagingPad.id);
  try {
    await padBank.deletePads([padId]);
  } catch (error) {
    try {
      await padBank.deletePads([stagingPad.id]);
    } catch (cleanupError) {
      throw new Error(
        `Could not prepare bank ${bank}: ${errorMessage(error)} Temporary copy ${stagingPad.id} could not be removed: ${errorMessage(cleanupError)}`,
        { cause: cleanupError },
      );
    }
    throw error;
  }

  let destinations: string[];
  try {
    destinations = await padBank.chopToBank(stagingPad.id, bank, count);
  } catch (error) {
    try {
      await padBank.copyPad(stagingPad.id, padId);
      await padBank.deletePads([stagingPad.id]);
    } catch (recoveryError) {
      throw new Error(
        `Chop failed: ${errorMessage(error)} Original sample remains at ${stagingPad.id}; recovery failed: ${errorMessage(recoveryError)}`,
        { cause: recoveryError },
      );
    }
    throw error;
  }

  try {
    await padBank.deletePads([stagingPad.id]);
  } catch (error) {
    throw new Error(
      `Slices were assigned to bank ${bank}, but temporary pad ${stagingPad.id} could not be removed: ${errorMessage(error)}`,
      { cause: error },
    );
  }
  return destinations;
}
