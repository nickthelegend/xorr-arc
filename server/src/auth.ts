/**
 * An owner's request, signed by the owner's own wallet. The executor acts on an owner's behalf only when the owner
 * signed this exact action in the last five minutes; it holds no sessions and no passwords. (The on-chain permission is
 * still the limit: a signed request can ask for a round, never for more than the grant allows.)
 */
import { getAddress, keccak256, stringToHex, verifyMessage, type Address, type Hex } from 'viem';

export function requestMessage(action: string, owner: string, body: unknown, at: number): string {
  return `XORR on Arc\naction: ${action}\nowner: ${getAddress(owner)}\nbody: ${JSON.stringify(body)}\nat: ${at}`;
}

export async function verifyRequest(req: { action: string; owner: string; body: unknown; at: number; signature: Hex }): Promise<Address> {
  if (!Number.isSafeInteger(req.at) || req.at <= 0) throw new Error('The signed request needs a valid timestamp.');
  if (Math.abs(Date.now() - req.at) > 5 * 60_000) throw new Error('The signed request is older than five minutes.');
  const owner = getAddress(req.owner);
  const ok = await verifyMessage({ address: owner, message: requestMessage(req.action, owner, req.body, req.at), signature: req.signature });
  if (!ok) throw new Error('The signature is not the owner’s.');
  return owner;
}


/** Canonical signed contents, so different signature spellings cannot bypass replay checks. */
export function requestReplayKey(req: { action: string; owner: string; body: unknown; at: number }): Hex {
  return keccak256(stringToHex(requestMessage(req.action, req.owner, req.body, req.at)));
}
