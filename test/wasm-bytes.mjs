// WebAssembly modules written byte by byte, for the tests of scripts/lib/modules.mjs: small enough
// to read, and valid, so that an engine reads them as well.

export const HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

/** An unsigned LEB128 number. */
export function leb(value) {
  const bytes = [];
  do {
    let byte = value & 0x7f;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 0x80;
    bytes.push(byte);
  } while (value > 0);
  return bytes;
}

const name = (text) => [...leb(Buffer.byteLength(text)), ...Buffer.from(text)];
export const section = (id, content) => [id, ...leb(content.length), ...content];

/** What an import is, after its two names: `func` (of type 0), or the bytes of another kind. */
export const FUNC = [0x00, 0x00];
export const MEMORY = [0x02, 0x00, 0x01];
export const TABLE = [0x01, 0x70, 0x00, 0x01];
export const GLOBAL = [0x03, 0x7f, 0x00];

/**
 * A module with the given imports, `[module, name, description]` (a function when the description
 * is left out), after a type section with the one type they use, and with a function-less body.
 */
export function wasm(imports = [], { custom = [], header = HEADER } = {}) {
  const parts = [...header];
  for (const text of custom) parts.push(...section(0, [...name(text), 1, 2, 3]));
  parts.push(...section(1, [1, 0x60, 0, 0]));
  if (imports.length > 0) {
    const entries = imports.flatMap(([module, field, description = FUNC]) => [...name(module), ...name(field), ...description]);
    parts.push(...section(2, [...leb(imports.length), ...entries]));
  }
  parts.push(...section(0, [...name("after"), 9]));
  return Buffer.from(parts);
}
