/**
 * extract.js — Perry WASM Runtime UI Extractor
 *
 * Reads the full wasm_runtime.js (which mixes platform-independent WASM bridge
 * code with browser-DOM UI widgets) and produces a clean, platform-independent
 * runtime.js at the repository root.
 *
 * The UI layer (perry_ui_* widget constructors, CSS reset, DOM event wiring,
 * clipboard, notifications, webview, canvas, media, etc.) is stripped from
 * FOUR locations:
 *   1. Inline uiMethodMap + __perryUiDispatch fallback inside
 *      buildImports.rt.class_call_method.
 *   2. __perryUiDispatch[name] fallback inside buildImports.rt.mem_call.
 *   3. Inline uiMethodMap + __perryUiDispatch fallback inside
 *      __memDispatch.class_call_method.
 *   4. The standalone UI section after `// ===== Perry UI Runtime`.
 *
 * `callWasmClosure` is preserved because it is a general-purpose utility for
 * invoking WASM closures from JS — it has zero DOM dependencies.
 * `__classDispatch` is trimmed to remove the UI-method-dispatch fallback while
 * keeping the primitive/class-method-table fast-paths.
 *
 * Usage:  node extract.js
 * Output: runtime.js  (in the current working directory)
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const SRC = join(
  __dirname,
  "perry",
  "crates",
  "perry-codegen-wasm",
  "src",
  "wasm_runtime.js",
);
const OUT = join(__dirname, "runtime.js");

// ---------------------------------------------------------------------------
// Read source
// ---------------------------------------------------------------------------
let src = readFileSync(SRC, "utf-8");

// ===========================================================================
// Edit 1 — Remove the inline uiMethodMap fallback inside class_call_method
// (part of buildImports, which lives before the UI_MARKER).
// ===========================================================================
//
// BEFORE:
//         // Fallback: UI widget method dispatch
//         // Map common method names to perry_ui_* bridge functions
//         const uiMethodMap = { ... };
//         const uiFnName = uiMethodMap[mname];
//         if (uiFnName) { ... }
//         return u64ToF64(TAG_UNDEFINED);
//
// AFTER:
//         return u64ToF64(TAG_UNDEFINED);

const CLASS_CALL_METHOD_UI_FALLBACK_START =
  "\n        // Fallback: UI widget method dispatch";

const idx1 = src.indexOf(CLASS_CALL_METHOD_UI_FALLBACK_START);
if (idx1 === -1) {
  console.error("ERROR: class_call_method UI fallback block not found (1).");
  process.exit(1);
}

const afterFallback = src.indexOf("\n      class_get_field:", idx1);
if (afterFallback === -1) {
  console.error("ERROR: class_get_field after class_call_method fallback not found.");
  process.exit(1);
}

const slice1 = src.slice(idx1, afterFallback);
const returnMarker = "\n        return u64ToF64(TAG_UNDEFINED);\n";
const returnIdx = slice1.lastIndexOf(returnMarker);
if (returnIdx === -1) {
  console.error("ERROR: closing return in class_call_method fallback not found.");
  process.exit(1);
}

const fallbackBlockEnd = idx1 + returnIdx + returnMarker.length;
src = src.slice(0, idx1) + "\n        return u64ToF64(TAG_UNDEFINED);\n" + src.slice(fallbackBlockEnd);

// ===========================================================================
// Edit 2 — Remove the __perryUiDispatch fallback inside mem_call
// ===========================================================================
const MEM_CALL_UI_BLOCK =
  "        } else {\n" +
  "          const uiFn = __perryUiDispatch[name];\n" +
  "          if (uiFn) {\n" +
  "            result = uiFn(...args);\n" +
  "          } else if (argc > 0) {\n" +
  "            result = __classDispatch(args[0], name, args.slice(1));\n" +
  "          }\n" +
  "        }";

const MEM_CALL_UI_REPLACEMENT =
  "        } else if (argc > 0) {\n" +
  "          result = __classDispatch(args[0], name, args.slice(1));\n" +
  "        }";

if (!src.includes(MEM_CALL_UI_BLOCK)) {
  console.error("ERROR: mem_call UI dispatch block not found (2).");
  process.exit(1);
}
src = src.replace(MEM_CALL_UI_BLOCK, MEM_CALL_UI_REPLACEMENT);

// ===========================================================================
// Edit 3 — Remove the inline uiMethodMap fallback inside __memDispatch's
// class_call_method (also in the core preamble, like Edit 1).
// ===========================================================================
const MEMDISP_UI_FALLBACK_START =
  "\n    // Fallback to UI method dispatch\n" +
  "    const uiMethodMap = {\n" +
  "      addChild: \"perry_ui_widget_add_child\"";

const idx3 = src.indexOf(MEMDISP_UI_FALLBACK_START);
if (idx3 === -1) {
  console.error("ERROR: __memDispatch class_call_method UI fallback not found (3).");
  process.exit(1);
}

// Cut from idx3 to the position of `\n    return undefined;` (which follows
// the block), preserving the `return undefined;\n  },` that belongs to the
// enclosing function.
const fallbackEnd3 = src.indexOf("\n    return undefined;\n  },\n  class_get_field:", idx3);
if (fallbackEnd3 === -1) {
  console.error("ERROR: end of __memDispatch UI fallback not found (3).");
  process.exit(1);
}

src = src.slice(0, idx3) + "" + src.slice(fallbackEnd3);

// ===========================================================================
// Edit 4 — Remove the standalone UI section
// ===========================================================================
const UI_MARKER = "\n// ===== Perry UI Runtime (DOM-based, for --target wasm) =====\n";
const uiIdx = src.indexOf(UI_MARKER);
if (uiIdx === -1) {
  console.error("ERROR: UI marker not found (4).");
  process.exit(1);
}

const corePreamble = src.slice(0, uiIdx);
const tail = src.slice(uiIdx);

// ----- Extract callWasmClosure from the tail -----
const HCW_START =
  "\n// Helper: call a WASM closure — accepts either a raw NaN-boxed f64 handle,\n";
const hcwStart = tail.indexOf(HCW_START);
const CWC_START = "\nfunction callWasmClosure(closureVal, ...extraArgs) {\n";
const cwcStart = tail.indexOf(CWC_START);
if (cwcStart === -1) {
  console.error("ERROR: callWasmClosure not found in tail.");
  process.exit(1);
}

let braceDepth = 0;
let inFunc = false;
let cwcEnd = -1;
for (let i = cwcStart; i < tail.length; i++) {
  const ch = tail[i];
  if (ch === "{") {
    braceDepth++;
    inFunc = true;
  } else if (ch === "}") {
    braceDepth--;
    if (inFunc && braceDepth === 0) {
      cwcEnd = i + 1;
      break;
    }
  }
}
if (cwcEnd === -1) {
  console.error("ERROR: could not find end of callWasmClosure.");
  process.exit(1);
}

let callWasmClosureSrc = tail.slice(hcwStart, cwcEnd);
if (tail[cwcEnd] === "\n") callWasmClosureSrc += "\n";

// ----- Locate __classDispatch and __bitsToJsValue in the tail -----
const CD_START_MARKER = "\nfunction __classDispatch(objVal, mname, rawArgs) {\n";
const cdStart = tail.indexOf(CD_START_MARKER);
if (cdStart === -1) {
  console.error("ERROR: __classDispatch not found in tail.");
  process.exit(1);
}

const B2J_MARKER =
  "\n// Convert raw u64 BigInt bits to a JS value, decoding NaN-boxed tags directly.\n";
const b2jStart = tail.indexOf(B2J_MARKER);
if (b2jStart === -1) {
  console.error("ERROR: __bitsToJsValue comment block not found in tail.");
  process.exit(1);
}

const classDispatchSrc = tail.slice(cdStart, b2jStart);
const coreTail = tail.slice(b2jStart);

// ----- Remove UI fallback from __classDispatch -----
const UI_DISPATCH_BLOCK =
  "\n  // 2) Try UI widget/state method dispatch\n" +
  "  const uiFnName = __uiMethodMap[mname];\n" +
  "  if (uiFnName) {\n" +
  "    const fn = __perryUiDispatch[uiFnName];\n" +
  "    if (fn) {\n" +
  "      return fn(objVal, ...rawArgs);\n" +
  "    }\n" +
  "  }\n";

const cleanedClassDispatch = classDispatchSrc.replace(UI_DISPATCH_BLOCK, "\n");

// ===========================================================================
// Assemble
// ===========================================================================
let runtime = [
  corePreamble,
  "",
  callWasmClosureSrc,
  "\n",
  cleanedClassDispatch,
  coreTail,
].join("");

// Fix stale comment
runtime = runtime.replace(
  "  // __class__ and aren't in __uiMethodMap, so method calls like `str.charCodeAt(i)`",
  "  // __class__, so method calls like `str.charCodeAt(i)`",
);

// ===========================================================================
// Write output
// ===========================================================================
writeFileSync(OUT, runtime, "utf-8");
console.log(`✅  Generated platform-independent runtime: ${OUT}`);
console.log(`    Source size:  ${(src.length / 1024).toFixed(1)} KiB  (after inline edits)`);
console.log(`    Output size:  ${(runtime.length / 1024).toFixed(1)} KiB`);
