# typerry

📖 [中文](README.zh.md)

**TypeScript → WebAssembly compiler. Standalone. No runtime bloat.**

---

typerry compiles TypeScript source files directly to WebAssembly — no JavaScript engine, no intermediate VM, no heavy runtime. It was extracted from the [Perry](https://github.com/PerryTS/perry) native TypeScript compiler and packaged as a standalone npm library.

Under the hood it uses the [swc](https://swc.rs/) parser for TypeScript syntax, a custom HIR (Perry high-level intermediate representation), and WASM codegen backend — all written in Rust and exposed to JavaScript via [napi-rs](https://napi.rs/).

## Quick Start

```bash
npm install typerry
```

```js
import { wasmBare, wasmBoot, wasmHtml } from "typerry";

// Compile TypeScript to raw WASM bytes
const wasm = wasmBare("export function add(a: i32, b: i32): i32 { return a + b; }");
// → <Buffer 00 61 73 6d ...>

// Compile to WASM + platform-independent JS runtime
const { wasm, runtime } = wasmBoot(
  "console.log('Hello from WASM!');",
  "",    // FFI imports
  true,  // auto-boot
  false  // minify
);
// → { wasm: <Buffer>, runtime: "// Perry WASM Runtime Bridge\n..." }

// Compile to a self-contained HTML page
const html = wasmHtml(
  "document.body.textContent = 'Hello!';",
  "{ doc() { return document; } }",
  false
);
```

### CLI

```bash
npx typerry input.ts                  # → output.wasm + output.js
npx typerry input.ts --html           # → output.html
npx typerry input.ts --bare           # → output.wasm
npx typerry input.ts -o dist/app -m   # custom output, minified
```

## Multiple Compilation Options

* Compile TypeScript to bare WASM bytes. No JS wrapper, no runtime — just the `.wasm` module.

* Compile TypeScript to WASM + a platform-independent ES module runtime. The runtime handles NaN-boxing, string interning, and FFI imports. Works in Node.js, Bun, and browsers.

* Compile TypeScript to a self-contained HTML page with embedded base64 WASM. Open it in any browser — no build step needed.

## Supported Runtimes

| Runtime | Support |
|---------|---------|
| Node.js ≥ 18 | ✅ Native (napi-rs addon) |
| Bun | ✅ Native (.node addon) |
| Deno | ⚠️ (requires napi compat) |
| Browser | ✅ (output runs in browser) |

## Compilation Pipeline

```
TypeScript source
       │
       ▼
      AST
       │
       ▼
HIR (lower + monomorphize)
       │
       ▼
  WASM binary
       │
       ▼
  JS runtime glue
```

All stages are compiled to a single native `.node` addon via napi-rs, so the entire pipeline runs in-process with zero subprocess overhead.

## Use Cases

| Scenario | Description |
|----------|-------------|
| **Performance** | Offload CPU-heavy logic (data processing, math, image manipulation) to WASM for near-native speed |
| **Cryptography** | Compile encryption, hashing, and security-sensitive algorithms — WASM is harder to reverse than plain JS |
| **Edge & serverless** | Compact WASM modules ideal for Cloudflare Workers, Deno Deploy, AWS Lambda |
| **Code protection** | Distribute proprietary logic as WASM binary instead of readable source |
| **Cross-platform libraries** | Write once in TypeScript, compile to WASM that runs in browser, Node.js, Bun, and Deno |
| **Plugin systems** | Accept user-submitted TypeScript, compile to sandboxed WASM plugins at runtime |

## Why typerry?

- **No runtime** — no external runtime or library dependencies
- **Small footprint** — typerry binary is ~2 MB
- **Platform-independent output** — generated `.js` + `.wasm` run anywhere with WebAssembly support
- **FFI support** — declare host functions in TypeScript, provide them at compile time
- **Rust-powered** — leverages the same swc parser that powers Next.js, Deno, and SWC

## License

MIT

[![npm version](https://img.shields.io/npm/v/typerry)](https://www.npmjs.com/package/typerry)
[![license](https://img.shields.io/npm/l/typerry)](LICENSE)

*typerry is extracted from [Perry](https://github.com/PerryTS/perry), the native TypeScript compiler.*
