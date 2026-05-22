# typerry

📖 [English](README.md)

**TypeScript → WebAssembly 编译器。独立运行，零依赖。**

---

typerry 将 TypeScript 源码直接编译为 WebAssembly——无需 JavaScript 引擎、无需中间虚拟机、无需重型运行时。它从 [Perry](https://github.com/PerryTS/perry) 原生 TypeScript 编译器中提取，封装为独立的 npm 包发布。

底层使用 [swc](https://swc.rs/) 解析器处理 TypeScript 语法、自定义 HIR（Perry 高级中间表示）、WASM 代码生成后端——全部以 Rust 编写，通过 [napi-rs](https://napi.rs/) 暴露给 JavaScript。

## 快速开始

```bash
npm install typerry
```

```js
import { wasmBare, wasmBoot, wasmHtml } from "typerry";

// 编译 TypeScript 为裸 WASM 字节码
const wasm = wasmBare("export function add(a: i32, b: i32): i32 { return a + b; }");
// → <Buffer 00 61 73 6d ...>

// 编译为 WASM + 跨平台 JS 运行时
const { wasm, runtime } = wasmBoot(
  "console.log('Hello from WASM!');",
  "",    // FFI 导入
  true,  // 自动启动
  false  // 不压缩
);
// → { wasm: <Buffer>, runtime: "// Perry WASM Runtime Bridge\n..." }

// 编译为自包含 HTML 页面
const html = wasmHtml(
  "document.body.textContent = 'Hello!';",
  "{ doc() { return document; } }",
  false
);
```

### 命令行

```bash
npx typerry input.ts                  # → output.wasm + output.js
npx typerry input.ts --html           # → output.html
npx typerry input.ts --bare           # → output.wasm
npx typerry input.ts -o dist/app -m   # 自定义输出，压缩运行时
```

## 多种编译方式

* 编译 TypeScript 为裸 WASM 字节码。不含 JS 包装、不含运行时——只有 `.wasm` 模块。

* 编译 TypeScript 为 WASM + 跨平台 ES 模块运行时。运行时处理 NaN-boxing、字符串表和 FFI 导入。可在 Node.js、Bun 和浏览器中运行。

* 编译 TypeScript 为自包含 HTML 页面，WASM 以 base64 嵌入。直接用浏览器打开——无需构建步骤。

## 支持的运行时

| 运行时 | 支持状态 |
|--------|----------|
| Node.js ≥ 18 | ✅ 原生（napi-rs 插件）|
| Bun | ✅ 原生（支持 .node 插件）|
| Deno | ⚠️（需要 napi 兼容层）|
| 浏览器 | ✅（编译产物可在浏览器中运行）|

## 编译管线

```
TypeScript 源码
       │
       ▼
      AST
       │
       ▼
  HIR（降级 + 单态化）
       │
       ▼
  WASM 二进制
       │
       ▼
  JS 运行时胶水代码
```

所有阶段编译为单个原生 `.node` 插件（通过 napi-rs），整个编译管线在进程内运行，零子进程开销。

## 使用场景

| 场景 | 说明 |
|------|------|
| **高性能计算** | 将 CPU 密集型逻辑（数据处理、数学运算、图像处理）编译为 WASM，获得接近原生的执行速度 |
| **加密与安全** | 编译加密、哈希等敏感算法——WASM 二进制比明文 JS 更难逆向 |
| **边缘计算 / Serverless** | 紧凑的 WASM 模块非常适合 Cloudflare Workers、Deno Deploy、AWS Lambda |
| **代码保护** | 以 WASM 二进制形式分发核心逻辑，而非可读的源码 |
| **跨平台库** | 用 TypeScript 编写一次，编译为 WASM 即可在浏览器、Node.js、Bun、Deno 中运行 |
| **插件系统** | 接受用户提交的 TypeScript，在运行时编译为沙箱化 WASM 插件 |

## 为什么选择 typerry？

- **零依赖** — 没有外部运行时或库依赖
- **体积较小** — typerry 原生二进制约 2 MB
- **跨平台输出** — 生成的 `.js` + `.wasm` 可在任何支持 WebAssembly 的环境运行
- **FFI 支持** — 在 TypeScript 中声明宿主函数，编译时注入
- **Rust 驱动** — 使用与 Next.js、Deno 和 SWC 相同的 swc 解析器

## 开源协议

MIT

[![npm version](https://img.shields.io/npm/v/typerry)](https://www.npmjs.com/package/typerry)
[![license](https://img.shields.io/npm/l/typerry)](LICENSE)

*typerry 提取自 [Perry](https://github.com/PerryTS/perry) 原生 TypeScript 编译器。*
