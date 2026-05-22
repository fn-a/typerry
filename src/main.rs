
use std::fs;
use std::path::PathBuf;
use anyhow::Result;
use clap::Parser;

use typerry::{wasm_html, wasm_bare, wasm_boot};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Input TypeScript file
    input: PathBuf,

    /// Output file (HTML or raw .wasm)
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// FFI imports required by the WASM module
    #[arg(short, long)]
    imports: Option<String>,

    /// Generate single HTML file wrapper with embedded WASM
    #[arg(long)]
    html: bool,

    /// Generate bare WASM file without any js wrapper
    #[arg(long)]
    bare: bool,

    /// Disable auto-boot the WASM module
    #[arg(long)]
    logy: bool,

    /// Minify output js file
    #[arg(short, long)]
    minify: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();
    
    let source = fs::read_to_string(&args.input)?;
    let imports = args.imports.unwrap_or("".to_owned());
    
    let mut output = args.output.unwrap_or(args.input.clone());
    
    if args.html {
        output.set_extension("html");
    } else {
        output.set_extension("wasm");
    }
    
    if args.html {
        let html = wasm_html(&source, &imports, args.minify)?;
        fs::write(output, html)?;
    } else if args.bare {
        let wasm = wasm_bare(&source)?;
        fs::write(output, wasm)?;
    } else {
        let (wasm, runtime) = wasm_boot(&source, &imports, !args.logy, args.minify)?;
        fs::write(output.clone(), wasm)?;
        output.set_extension("");
        output.set_extension("js");
        fs::write(output, runtime)?;
    }
    
    Ok(())
}
