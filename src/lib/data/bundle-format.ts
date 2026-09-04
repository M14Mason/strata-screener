/**
 * Binary format for the prebuilt end-of-day dataset.
 *
 * A hosted screener cannot call a market-data API once per symbol per request,
 * and JSON for a few thousand symbols x 320 sessions runs to nine figures of
 * bytes. So the dataset is packed into a single typed-array blob that the
 * server memory-maps once at boot and reads with zero parsing.
 *
 * Layout (all little-endian):
 *
 *   magic       4 bytes   "STRA"
 *   version     u32
 *   asOf        f64       epoch ms of the most recent session
 *   sessions    u32       number of daily bars per symbol (S)
 *   symbols     u32       number of symbols (N)
 *   dates       f64 * S   session timestamps, oldest first
 *   nameLen     u32       byte length of the symbol index (UTF-8 JSON)
 *   names       bytes     JSON array of symbols, in row order
 *   padding     0-3 bytes so the float planes start 4-byte aligned
 *   open        f32 * N*S row-major: symbol i occupies [i*S, (i+1)*S)
 *   high        f32 * N*S
 *   low         f32 * N*S
 *   close       f32 * N*S
 *   volume      f32 * N*S volume is stored in thousands to stay inside f32
 *
 * f32 holds ~7 significant digits, which is ample for prices; volume is scaled
 * by 1e-3 so that even a billion-share session keeps full precision.
 *
 * A missing session for a symbol is stored as NaN and is skipped when the bars
 * are rebuilt, so indicators are computed on real sessions only.
 *
 * The symbol index is variable length, so the planes are padded onto a 4-byte
 * boundary. Without that, `new Float32Array(buffer, offset, n)` throws for most
 * symbol counts and the dataset can only be read by copying it a second time.
 */

export const BUNDLE_MAGIC = 0x41525453; // "STRA" little-endian

/** Round a byte offset up to the next 4-byte boundary. */
export const align4 = (n: number) => (n + 3) & ~3;
export const BUNDLE_VERSION = 1;
export const VOLUME_SCALE = 1_000;

export interface BundleHeader {
  version: number;
  asOf: number;
  sessions: number;
  symbols: number;
  dates: Float64Array;
  names: string[];
  /** Byte offset where the price planes begin. */
  dataOffset: number;
}

export function readHeader(buffer: ArrayBuffer): BundleHeader {
  const view = new DataView(buffer);
  let offset = 0;

  const magic = view.getUint32(offset, true);
  offset += 4;
  if (magic !== BUNDLE_MAGIC) throw new Error("Not a Strata dataset bundle (bad magic bytes).");

  const version = view.getUint32(offset, true);
  offset += 4;
  if (version !== BUNDLE_VERSION) {
    throw new Error(`Dataset bundle is version ${version}, this build reads version ${BUNDLE_VERSION}.`);
  }

  const asOf = view.getFloat64(offset, true);
  offset += 8;
  const sessions = view.getUint32(offset, true);
  offset += 4;
  const symbols = view.getUint32(offset, true);
  offset += 4;

  // Float64Array needs 8-byte alignment, so copy rather than view in place.
  const dates = new Float64Array(buffer.slice(offset, offset + sessions * 8));
  offset += sessions * 8;

  const nameLen = view.getUint32(offset, true);
  offset += 4;
  const names = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset, nameLen))) as string[];
  offset += nameLen;
  offset = align4(offset);

  return { version, asOf, sessions, symbols, dates, names, dataOffset: offset };
}

/** Byte length of one price plane. */
export const planeBytes = (symbols: number, sessions: number) => symbols * sessions * 4;

export function encodeBundle(input: {
  asOf: number;
  dates: number[];
  names: string[];
  open: Float32Array;
  high: Float32Array;
  low: Float32Array;
  close: Float32Array;
  volume: Float32Array;
}): Uint8Array {
  const { asOf, dates, names, open, high, low, close, volume } = input;
  const sessions = dates.length;
  const symbols = names.length;
  const nameBytes = new TextEncoder().encode(JSON.stringify(names));

  const headerBytes = align4(4 + 4 + 8 + 4 + 4 + sessions * 8 + 4 + nameBytes.length);
  const total = headerBytes + planeBytes(symbols, sessions) * 5;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  let offset = 0;
  view.setUint32(offset, BUNDLE_MAGIC, true);
  offset += 4;
  view.setUint32(offset, BUNDLE_VERSION, true);
  offset += 4;
  view.setFloat64(offset, asOf, true);
  offset += 8;
  view.setUint32(offset, sessions, true);
  offset += 4;
  view.setUint32(offset, symbols, true);
  offset += 4;
  for (const d of dates) {
    view.setFloat64(offset, d, true);
    offset += 8;
  }
  view.setUint32(offset, nameBytes.length, true);
  offset += 4;
  out.set(nameBytes, offset);
  offset = align4(offset + nameBytes.length);

  for (const plane of [open, high, low, close, volume]) {
    out.set(new Uint8Array(plane.buffer, plane.byteOffset, plane.byteLength), offset);
    offset += plane.byteLength;
  }

  return out;
}
