#!/usr/bin/env node

/**
 * typerry — Standalone TypeScript → WebAssembly compiler
 *
 * Library usage:
 *   import { wasmHtml, wasmBare, wasmBoot } from "typerry";
 *
 * CLI usage:
 *   node index.js <input.ts> [-o output] [-i imports] [--html | --bare] [--logy] [-m]
 *
 *   <input.ts>          TypeScript source file
 *   -o, --output <path> Output file base (default: derived from input)
 *   -i, --imports <str> FFI imports as JS object literal
 *   --html              Emit a self-contained HTML page
 *   --bare              Emit bare WASM (no JS runtime)
 *   --logy              Disable auto-boot in JS runtime (default: auto-boot on)
 *   -m, --minify        Minify the embedded JS runtime
 *
 * Supported runtimes: Node.js ≥ 18, Bun, Deno (napi addon)
 */

import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const VERSION = _require("./package.json").version;

// CLI argument parsing (zero-dependency)
function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    imports: "",
    html: false,
    bare: false,
    logy: false,
    minify: false,
    help: false,
  };

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    switch (a) {
      case "-o":
      case "--output":
        args.output = argv[++i] ?? null;
        break;
      case "-i":
      case "--imports":
        args.imports = argv[++i] ?? "";
        break;
      case "--html":
        args.html = true;
        break;
      case "--bare":
        args.bare = true;
        break;
      case "--logy":
        args.logy = true;
        break;
      case "-m":
      case "--minify":
        args.minify = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (a.startsWith("-")) {
          console.error(`Unknown flag: ${a}`);
          args.help = true;
        } else if (!args.input) {
          args.input = a;
        }
    }
    i++;
  }
  return args;
}

// Print help message
function printHelp() {
  console.log(`typerry ${VERSION} — TypeScript → WebAssembly compiler

Usage:
  node index.js <input.ts> [options]

Arguments:
  <input.ts>           TypeScript source file

Options:
  -o, --output <path>  Output file base (default: same as input)
  -i, --imports <str>  FFI imports as a JS object literal
  --html               Emit a self-contained HTML file
  --bare               Emit bare WASM (no JS runtime)
  --logy               Disable auto-boot in the JS runtime
  -m, --minify         Minify the embedded JS runtime
  -h, --help           Show this help`);
}

// CLI entry point
async function cliexe(argv) {
  const opts = parseArgs(argv);

  if (opts.help || !opts.input) {
    printHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const { readFileSync, writeFileSync } = await import("node:fs");
  const path = await import("node:path");

  // Read source
  let source;
  try {
    source = readFileSync(opts.input, "utf-8");
  } catch (e) {
    console.error(`Error reading input file: ${e.message}`);
    process.exit(1);
  }

  // Determine output base
  const inputPath = path.parse(opts.input);
  const outBase = opts.output
    ? path.resolve(opts.output)
    : path.join(inputPath.dir, inputPath.name);

  // Load native addon
  const { wasmHtml, wasmBare, wasmBoot } = await import("./dist/index.js");

  try {
    if (opts.html) {
      // --html → single HTML file
      const html = wasmHtml(source, opts.imports, opts.minify);
      const out = outBase + ".html";
      writeFileSync(out, html);
      console.log(`Wrote ${out} (${html.length} chars)`);
    } else if (opts.bare) {
      // --bare → raw WASM
      const wasm = wasmBare(source);
      const out = outBase + ".wasm";
      writeFileSync(out, wasm);
      console.log(`Wrote ${out} (${wasm.length} bytes)`);
    } else {
      // default → WASM + JS runtime
      const autoBoot = !opts.logy;
      const { wasm, runtime } = wasmBoot(source, opts.imports, autoBoot, opts.minify);

      const wasmOut = outBase + ".wasm";
      const jsOut = outBase + ".js";
      writeFileSync(wasmOut, wasm);
      writeFileSync(jsOut, runtime);
      console.log(`Wrote ${wasmOut} (${wasm.length} bytes)`);
      console.log(`Wrote ${jsOut} (${runtime.length} chars)`);
    }
  } catch (e) {
    console.error(`Compilation error: ${e.message}`);
    process.exit(1);
  }
}

// Detect direct execution (CLI mode) vs. library import
function detect(meta) {
  // In Node.js / Bun / Deno, compare import.meta.url with the entry script.
  // `process.argv[1]` holds the script path when run directly (except Deno).
  if (typeof process !== "undefined" && process.argv?.[1]) {
    const scriptPath = process.argv[1].replace(/\\/g, "/");
    const thisPath = new URL(meta.url).pathname.replace(/\\/g, "/");
    return scriptPath.endsWith(thisPath) || thisPath.endsWith(scriptPath);
  }
  // Deno: Deno.mainModule check
  if (typeof globalThis.Deno !== "undefined") {
    return meta.url === Deno.mainModule;
  }
  return false;
}

if (detect(import.meta)) {
  cliexe(process.argv.slice(2));
}

// Library exports
export { wasmBare, wasmBoot, wasmHtml } from "./dist/index.js";
