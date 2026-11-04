#!/usr/bin/env python3
"""Local draw.io checks, decompression and Desktop export. Apache-2.0."""

import argparse
import base64
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote
import xml.etree.ElementTree as ET
import zlib


def parse_xml(text):
    if re.search(r"<!\s*(DOCTYPE|ENTITY)\b", text, re.I):
        raise ValueError("DTD/entity declarations are not supported")
    return ET.fromstring(text)


def load_diagram(source):
    document = parse_xml(source.read_text(encoding="utf-8-sig"))
    if document.tag == "mxGraphModel":
        return document, [("Page 1", document)]
    if document.tag != "mxfile":
        raise ValueError("expected mxfile or mxGraphModel")
    pages = []
    for index, page in enumerate(document.findall("diagram"), 1):
        model = page.find("mxGraphModel")
        if model is None:
            payload = base64.b64decode("".join((page.text or "").split()), validate=True)
            inflater = zlib.decompressobj(-15)
            decoded = inflater.decompress(payload, 16 * 1024 * 1024)
            if not inflater.eof:
                raise ValueError("compressed page is incomplete or exceeds 16 MiB")
            model = parse_xml(unquote(decoded.decode("utf-8"), errors="strict"))
            page.text = None
            page.append(model)
        if model.tag != "mxGraphModel":
            raise ValueError("page payload must be mxGraphModel")
        pages.append((page.get("name", "Page %s" % index), model))
    if not pages:
        raise ValueError("mxfile has no diagram pages")
    return document, pages


def check_pages(pages):
    vertices = 0
    edges = 0
    for name, model in pages:
        root = model.find("root")
        if root is None:
            raise ValueError("%s: missing root" % name)
        cells = {}
        for item in root:
            cell = item if item.tag == "mxCell" else item.find("mxCell")
            if cell is None:
                raise ValueError("%s: unsupported root element %s" % (name, item.tag))
            cell_id = item.get("id") or cell.get("id")
            if not cell_id or cell_id in cells:
                raise ValueError("%s: missing or duplicate cell ID %r" % (name, cell_id))
            cells[cell_id] = cell
        if "0" not in cells or "1" not in cells or cells["1"].get("parent") != "0":
            raise ValueError("%s: expected root 0 and layer 1 with parent 0" % name)
        if cells["0"].get("parent") is not None:
            raise ValueError("%s: root 0 must not have a parent" % name)
        for cell_id, cell in cells.items():
            parent = cell.get("parent")
            if cell_id != "0" and parent not in cells:
                raise ValueError("%s: cell %s has unknown parent %r" % (name, cell_id, parent))
            seen = {cell_id}
            while parent is not None:
                if parent in seen:
                    raise ValueError("%s: parent cycle at %s" % (name, cell_id))
                if parent not in cells:
                    raise ValueError("%s: unknown ancestor %s" % (name, parent))
                seen.add(parent)
                parent = cells[parent].get("parent")
            is_vertex = cell.get("vertex") == "1"
            is_edge = cell.get("edge") == "1"
            if not (is_vertex or is_edge):
                continue
            geometry = cell.find("mxGeometry")
            if geometry is None or geometry.get("as") != "geometry":
                raise ValueError("%s: cell %s needs mxGeometry" % (name, cell_id))
            for key in ("x", "y", "width", "height"):
                value = float(geometry.get(key, "0"))
                if not math.isfinite(value) or (is_vertex and key in ("width", "height") and value <= 0):
                    raise ValueError("%s: cell %s has invalid %s" % (name, cell_id, key))
            if is_edge:
                if geometry.get("relative") != "1":
                    raise ValueError("%s: edge %s needs relative geometry" % (name, cell_id))
                for end in ("source", "target"):
                    ref = cell.get(end)
                    if ref is not None and ref not in cells:
                        raise ValueError("%s: edge %s has unknown %s %s" % (name, cell_id, end, ref))
                    if ref is None and geometry.find("mxPoint[@as='%sPoint']" % end) is None:
                        raise ValueError("%s: edge %s has no %s endpoint" % (name, cell_id, end))
                edges += 1
            vertices += int(is_vertex)
    return vertices, edges


def check_resources(document):
    # Imported labels/styles can make Desktop fetch resources while rendering.
    remote = re.compile(r"(?:\bimage\s*=\s*|\bsrc\s*=\s*['\"]?\s*|\burl\s*\(\s*['\"]?\s*)(?:https?:)?//", re.I)
    for element in document.iter():
        for key, value in element.attrib.items():
            if key in ("style", "value", "label") and (
                remote.search(value) or re.search(r"<\s*(script|iframe|link)\b|@import\b", value, re.I)
            ):
                raise ValueError("remote or active rendering resource; replace it with local/basic shapes")


def find_desktop(explicit=None):
    configured = explicit or os.environ.get("DRAWIO_DESKTOP")
    if configured:
        executable = Path(configured).expanduser().resolve()
        if not executable.is_file() or not os.access(executable, os.X_OK):
            raise ValueError("Desktop executable not found: %s" % executable)
        return str(executable)
    candidates = [shutil.which("drawio"), shutil.which("draw.io")]
    if sys.platform == "darwin":
        candidates.extend([
            "/Applications/draw.io.app/Contents/MacOS/draw.io",
            str(Path.home() / "Applications/draw.io.app/Contents/MacOS/draw.io"),
        ])
    elif sys.platform == "win32":
        for variable, suffix in (("ProgramFiles", "draw.io/draw.io.exe"),
                                 ("LOCALAPPDATA", "Programs/draw.io/draw.io.exe")):
            if os.environ.get(variable):
                candidates.append(str(Path(os.environ[variable]) / suffix))
    else:
        candidates.extend(["/opt/drawio/drawio", "/snap/bin/drawio"])
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return str(Path(candidate).resolve())
    raise ValueError("draw.io Desktop not found; keep the .drawio file. Export needs an existing Desktop installation; use --desktop or DRAWIO_DESKTOP for a custom path")


def export(source, args):
    output = Path(args.out).expanduser().resolve() if args.out else source.with_suffix(".drawio." + args.format)
    if output == source or (output.exists() and output.samefile(source)):
        raise ValueError("export must not overwrite the .drawio source")
    if output.suffix.lower() != "." + args.format:
        raise ValueError("output extension must match --format")
    if output.exists() and not args.force:
        raise ValueError("output exists; use --force to replace it")
    desktop = find_desktop(args.desktop)
    command = [desktop, "--disable-update", "--export", "--format", args.format,
               "--embed-diagram", "--border", "10"]
    if args.format == "svg":
        command.extend(["--embed-svg-fonts", "false"])
    if args.page:
        command.extend(["--page-index", str(args.page)])
    elif args.format == "pdf":
        command.append("--all-pages")
    if args.disable_gpu:
        command.append("--disable-gpu")
    with tempfile.TemporaryDirectory(prefix=".drawio-", dir=output.parent) as scratch:
        temporary = Path(scratch) / ("export." + args.format)
        result = subprocess.run(command + ["--output", str(temporary), str(source)],
                                capture_output=True, text=True, timeout=120)
        if result.returncode:
            raise ValueError("Desktop export failed (%s): %s" % (result.returncode, (result.stderr or result.stdout).strip()))
        if not temporary.is_file() or temporary.stat().st_size == 0:
            raise ValueError("Desktop returned without a nonempty export; source retained")
        temporary.replace(output)
    print("Exported: %s\nSource retained: %s" % (output, source))


def positive_page(value):
    page = int(value)
    if page < 1:
        raise argparse.ArgumentTypeError("page is 1-based")
    return page


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    locate = commands.add_parser("locate", help="find an already installed Desktop executable")
    locate.add_argument("--desktop")
    for action in ("check", "unpack", "export"):
        sub = commands.add_parser(action)
        sub.add_argument("source", type=Path)
        if action == "unpack":
            sub.add_argument("--out", required=True, type=Path)
        if action == "export":
            sub.add_argument("--format", required=True, choices=("png", "svg", "pdf"))
            sub.add_argument("--out")
            sub.add_argument("--desktop")
            sub.add_argument("--page", type=positive_page)
            sub.add_argument("--force", action="store_true")
            sub.add_argument("--disable-gpu", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "locate":
            print(find_desktop(args.desktop))
            return
        source = args.source.expanduser().resolve()
        document, pages = load_diagram(source)
        vertices, edges = check_pages(pages)
        check_resources(document)
        if args.command == "check":
            print("Valid: %s (%s pages, %s vertices, %s edges)" % (source, len(pages), vertices, edges))
        elif args.command == "unpack":
            output = args.out.expanduser().resolve()
            if document.tag == "mxfile":
                document.set("compressed", "false")
            with output.open("x", encoding="utf-8") as handle:
                handle.write(ET.tostring(document, encoding="unicode") + "\n")
            print("Uncompressed copy: %s\nSource retained: %s" % (output, source))
        else:
            if args.page and args.page > len(pages):
                raise ValueError("page exceeds the diagram's %s pages" % len(pages))
            export(source, args)
    except (OSError, ValueError, ET.ParseError, zlib.error, subprocess.TimeoutExpired) as error:
        print("drawio: %s" % error, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
