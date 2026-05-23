use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use perry_hir::{ClassId, Module, lower_module_full};
use perry_codegen_wasm::emit::{WasmCompileOutput, compile_to_wasm_with_async, compile_to_wasm};
use perry_codegen_js::minify::minify_js;
use perry_parser::parse_typescript;

const RUNTIME: &str = include_str!("../runtime.js");

/// Compile TypeScript source to a self-contained HTML page.
pub fn wasm_html(source: &str, imports: &str, minify: bool) -> Result<String> {
    let modules = parse(source)?;
    let output = compile_to_wasm_with_async(&modules);
    let runtime = splice(&output, imports, minify)?;
    let wasm64 = BASE64.encode(&output.wasm_bytes);
    Ok(format!(
        r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <div id="perry-root"></div>
  <script>
{runtime}
  </script>
  <script>
window.__perryWasmB64 = "{wasm64}";
bootPerryWasm(window.__perryWasmB64).catch(e => {{
  document.getElementById("perry-root").textContent = "WASM Error: " + e.message;
  console.error("Boot error:", e);
}});
  </script>
</body>
</html>"#
    ))
}

/// Compile TypeScript source to bare WASM bytes.
pub fn wasm_bare(source: &str) -> Result<Vec<u8>> {
    let modules = parse(source)?;
    Ok(compile_to_wasm(&modules))
}

/// Compile TypeScript source to WASM bytes + JS runtime.
pub fn wasm_boot(source: &str, imports: &str, autobt: bool, minify: bool) -> Result<(Vec<u8>, String)> {
    let modules = parse(source)?;
    let output = compile_to_wasm_with_async(&modules);
    let mut runtime = splice(&output, imports, minify)?;

    runtime += r#"
async function bootFetchWasm(wasmPath, ffiImports) {
  if (ffiImports) {
    if (typeof __ffiImports === 'undefined') {
      globalThis.__ffiImports = ffiImports;
    } else {
      Object.assign(__ffiImports, ffiImports);
    }
  }
  const imports = wrapImportsForI64(buildImports());
  const wasmUrl = new URL(wasmPath, import.meta?.url || __filename);
  if (process.versions?.node && wasmUrl.protocol === 'file:') {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const wasmBytes = readFileSync(fileURLToPath(wasmUrl));
    const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
    wasmInstance = instance;
  } else {
    const wasmResp = await fetch(wasmUrl);
    if (!wasmResp.ok) throw new Error(`WASM fetch failed: ${wasmResp.status} ${wasmResp.statusText}`);
    const { instance } = await WebAssembly.instantiateStreaming(wasmResp, imports);
    wasmInstance = instance;
  }
  wasmMemory = wasmInstance.exports.memory;
  if (wasmInstance.exports._start) {
    wasmInstance.exports._start();
  } else if (wasmInstance.exports.main) {
    wasmInstance.exports.main();
  }
  return wasmInstance;
}"#;

    if autobt {
        runtime += r#"
function getWasmFilePath() {
  const fileUrl = import.meta?.url || __filename;
  const fileName = fileUrl.split(/[\\/]/).pop();
  if (!fileName) throw new Error('WASM file error: failed to get wasm file name');
  const dotIndex = fileName.lastIndexOf('.');
  return './' + (dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName) + '.wasm';
}
try {
  await bootFetchWasm(getWasmFilePath());
} catch (e) {
  console.error("Auto boot error:", e);
}"#;
    }

    runtime += "\nexport const boot = bootFetchWasm;\nexport const instance = wasmInstance;";

    Ok((output.wasm_bytes, runtime))
}

fn splice(output: &WasmCompileOutput, imports: &str, minify: bool) -> Result<String> {
    let mut runtime = if minify {
        minify_js(RUNTIME)
    } else {
        RUNTIME.to_string()
    };

    if !output.async_js.is_empty() {
        runtime += &format!(
            "\n// === Generated async function implementations ===\nconst __asyncFuncImpls = {{\n{}\n}};\n",
            output.async_js
        );
    }

    if !output.ffi_imports.is_empty() {
        runtime += &format!(
            "\n// === FFI imports required (provide via __ffiImports or bootPerryWasm 2nd arg) ===\n// {}\n",
            output.ffi_imports.join(", ")
        );
        if !imports.is_empty() {
            runtime += &format!("const __ffiImports = {imports};");
        }
    }

    Ok(runtime)
}

fn parse(source: &str) -> Result<Vec<(String, Module)>> {
    let ast = parse_typescript(source, "input.ts")?;
    let (module, _) = lower_module_full(
        &ast,
        "main",
        "input.ts",
        ClassId::default(),
        None,
        None,
        true,
        false,
    )?;
    Ok(vec![("main".to_string(), module)])
}

// napi-rs wrappers — callable from Node.js / Bun / Deno
pub mod expose {
    use napi::{Error, Result};
    use napi::bindgen_prelude::Buffer;
    use napi_derive::napi;
    use super::{wasm_bare, wasm_boot, wasm_html};
    
    #[napi(js_name = "wasmHtml")]
    pub fn napi_wasm_html(source: String, imports: String, minify: bool) -> Result<String> {
        wasm_html(&source, &imports, minify)
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }
    
    #[napi(js_name = "wasmBare")]
    pub fn napi_wasm_bare(source: String) -> Result<Buffer> {
        wasm_bare(&source)
            .map(|v| v.into())
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }
    
    #[napi(js_name = "wasmBoot")]
    pub fn napi_wasm_boot(
        source: String,
        imports: String,
        auto_boot: bool,
        minify: bool,
    ) -> Result<Bootput> {
        wasm_boot(&source, &imports, auto_boot, minify)
            .map(|(wasm, runtime)| Bootput {
                wasm: wasm.into(),
                runtime,
            })
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }
    
    /// Return type for `wasmBoot` — pairs the compiled WASM binary with the JS runtime.
    #[napi(object)]
    pub struct Bootput {
        pub wasm: Buffer,
        pub runtime: String,
    }
}