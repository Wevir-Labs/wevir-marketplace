# draw.io

Create and revise editable local `.drawio` flowcharts, system architecture diagrams and entity-relationship diagrams. Native XML keeps shapes, text and connectors editable in draw.io Desktop. PNG, SVG and PDF exports use an already installed Desktop CLI and embed the diagram XML; the `.drawio` source is always retained.

This Wevir adaptation is maintained by Wevir and is not an official JGraph plugin.

## Requirements

- **Python 3.9 or later** for the bundled XML checker, decompressor and export helper. Only the standard library is used; no packages are installed. Use `python3` on macOS/Linux or `py -3` on Windows.
- **draw.io Desktop, optional**, for PNG/SVG/PDF export. Install it yourself from [jgraph/drawio-desktop](https://github.com/jgraph/drawio-desktop/releases) if export is needed. Without it the skill still creates and edits usable `.drawio` files. The plugin never installs Desktop or substitutes a cloud renderer.
- Desktop export needs a working graphical session on Linux. Native macOS, Windows and Linux paths are supported. For WSL, run the helper and Desktop on the same OS; cross-OS path translation is not bundled.

No account, API key, OAuth application, connector or additional service is required.

## Examples

- “Create login-flow.drawio with password validation, a two-factor check and success/failure branches.”
- “Draw a browser, API, job queue, worker and database architecture in system.drawio; export SVG if draw.io Desktop is available.”
- “Add a Shipments entity to shop.drawio, linked to Orders, preserving the existing layout.”

Complete editable starting files are included in [`skills/drawio-diagrams/examples/`](skills/drawio-diagrams/examples/): `login-flow.drawio`, `system.drawio` and `shop.drawio`. Copy them into the project before editing; do not modify the installed plugin's examples.

## Local commands

From the plugin folder (use the installed skill's absolute path when working elsewhere):

```bash
python3 skills/drawio-diagrams/scripts/drawio.py check path/to/diagram.drawio
python3 skills/drawio-diagrams/scripts/drawio.py unpack path/to/diagram.drawio --out path/to/diagram-edit.drawio
python3 skills/drawio-diagrams/scripts/drawio.py locate
python3 skills/drawio-diagrams/scripts/drawio.py export path/to/diagram.drawio --format svg
python3 skills/drawio-diagrams/scripts/drawio.py export path/to/diagram.drawio --format pdf
```

`check` parses XML and compressed pages, then checks IDs, parent references/cycles, connector endpoints and geometry. It also rejects DTD/entity declarations and explicit remote/active rendering resources in labels and styles. It does not run the bundled XSD or measure visual overlap. `unpack` writes a new uncompressed copy, preserving pages and metadata; it refuses to overwrite an existing file.

Exports are written beside the source as `diagram.drawio.png`, `.svg` or `.pdf`. Use `--out` for a different destination, `--force` to replace an export, and `--page N` for a particular page (1-based). PDF includes all pages by default; PNG/SVG use the first page. `--disable-gpu` is available for a Desktop GPU startup failure. A missing Desktop or failed export returns an error and leaves the source intact.

Desktop discovery checks PATH and standard installation paths. For a custom location set `DRAWIO_DESKTOP` or pass `--desktop` with the executable's absolute path, such as `/Applications/draw.io.app/Contents/MacOS/draw.io` or `D:\Apps\draw.io\draw.io.exe`. The macOS executable must stay inside its application bundle.

Wevir's existing file sharing/display tools hand over the source and requested exports. There is no additional viewer; without a local export, `.drawio` can be shown as XML and opened later in Desktop.

## Data and network

The bundled helper reads local files and launches only the selected local Desktop executable. It has no network client, telemetry, cloud MCP, account or token storage. XML references and examples are bundled; it does not download a shape index, logos, scripts or required references at runtime. It never calls `mcp.draw.io`, `app.diagrams.net`, `viewer.diagrams.net` or `convert.diagrams.net`.

The skill uses basic shapes and system fonts. Desktop export commands disable update checks and SVG font embedding. Desktop is separate user-installed software and may have its own settings or network behavior; this plugin is not a network sandbox. Imported files with external assets should be converted to local/basic shapes before export. User-created files remain in the chosen project/session folder; Desktop may maintain its own application preferences.

Diagram content is still processed by the user's selected model. Choosing local file generation does not make a hosted model offline.

## Source and license

Adapted from the official [jgraph/drawio-mcp](https://github.com/jgraph/drawio-mcp) repository at fixed commit [`2a0f570328624eb9d7182a7389bfd9a25e223afe`](https://github.com/jgraph/drawio-mcp/tree/2a0f570328624eb9d7182a7389bfd9a25e223afe), under **Apache-2.0**. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

| Upstream path | Bundled adaptation |
| --- | --- |
| `plugins/codex/drawio/skills/drawio/SKILL.md` | `skills/drawio-diagrams/SKILL.md` |
| `shared/xml-essentials.md` | `skills/drawio-diagrams/references/xml-essentials.md` |
| `shared/xml-reference.md` | `skills/drawio-diagrams/references/xml-reference.md` |
| `shared/style-reference.md` | `skills/drawio-diagrams/references/style-reference.md` |
| `shared/mxfile.xsd` | `skills/drawio-diagrams/references/mxfile.xsd` |

Changes remove hosted MCP, browser URL output, online reference/shape lookups and source deletion after export; references use local links and XML authoring is the default. Upstream's `find-shapes.js` depends on remote services and is deliberately omitted. The new Python standard-library helper replaces shell snippets with local validation, compressed-page editing and Desktop export commands. The examples, manifest and generic diagram icon are original to this adaptation and use the same license. No upstream logo or hosted viewer is bundled.

## 中文说明

创建和编辑本地 `.drawio` 流程图、架构图与 ER 图，保留可编辑的形状、文字和连线。内置 Python 3.9+ 标准库脚本、XML 参考及三个完整示例，无需安装 Python 包。

导出 PNG、SVG、PDF 需要用户已有的 draw.io Desktop；未安装时仍交付 `.drawio`，不调用云端导出、MCP 或网页查看器。导出始终保留源文件，可用 `DRAWIO_DESKTOP` 或 `--desktop` 指定非标准安装路径。文件在本地读写，模型按会话所选配置处理图表内容，不承诺模型数据离线。
