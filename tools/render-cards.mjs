import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
globalThis.Path2D = Path2D;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const listSource = html.match(/const initialWords = \[([\s\S]*?)\n    \];/)?.[1];
if (!listSource) throw new Error("Kon de woordenlijst in index.html niet vinden.");

const words = [...listSource.matchAll(/\{ id: "([^"]+)", label: "([^"]+)", page: (\d+), tier: "([^"]+)" \}/g)]
  .map(([, id, label, page]) => ({ id, label, page: Number(page) }));
if (!words.length) throw new Error("Er zijn geen woorden gevonden.");

function normalized(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("nl").replace(/[^a-z0-9]/g, "");
}

function findLines(pixels, width, height, axis, start, end, threshold, sampleStart = 0, sampleEnd = axis === "horizontal" ? width : height) {
  const length = axis === "horizontal" ? height : width;
  const span = axis === "horizontal" ? width : height;
  const counts = new Uint16Array(length);
  for (let position = Math.max(0, start); position < Math.min(length, end); position++) {
    for (let offset = sampleStart; offset < Math.min(span, sampleEnd); offset++) {
      const x = axis === "horizontal" ? offset : position;
      const y = axis === "horizontal" ? position : offset;
      const index = (y * width + x) * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red < 145 && green < 145 && blue < 145) counts[position]++;
    }
  }

  const found = [];
  let group = [];
  for (let position = Math.max(0, start); position < Math.min(length, end); position++) {
    if (counts[position] >= threshold) {
      group.push(position);
    } else if (group.length) {
      found.push(Math.round(group.reduce((sum, item) => sum + item, 0) / group.length));
      group = [];
    }
  }
  if (group.length) found.push(Math.round(group.reduce((sum, item) => sum + item, 0) / group.length));
  return found;
}

function findTextItem(items, label, id) {
  const search = normalized(label.trim().split(/[/( ]/, 1)[0]);
  const alias = id === "mooi" ? "mool" : "";
  return items.find(item => normalized(item.str) === search || (alias && normalized(item.str) === alias));
}

const only = process.argv.find(argument => argument.startsWith("--only="))?.slice(7);
const selectedWords = only ? words.filter(word => word.id === only) : words;
if (only && !selectedWords.length) throw new Error(`Onbekend woord-id: ${only}`);

const pdfData = new Uint8Array(fs.readFileSync(path.join(root, "SMOG_woordenlijst_basis.pdf")));
const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
const output = path.join(root, "assets", "words");
fs.mkdirSync(output, { recursive: true });
const pageCache = new Map();

for (const word of selectedWords) {
  if (!pageCache.has(word.page)) {
    const page = await pdf.getPage(word.page);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const image = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const horizontal = findLines(image.data, canvas.width, canvas.height, "horizontal", Math.floor(canvas.height * 0.1), Math.floor(canvas.height * 0.9), canvas.width * 0.34);
    const items = (await page.getTextContent()).items;
    pageCache.set(word.page, { canvas, image, viewport, horizontal, items });
  }

  const source = pageCache.get(word.page);
  const item = findTextItem(source.items, word.label, word.id);
  if (!item) {
    console.warn(`Geen gedrukte tekst gevonden voor ${word.id} op pagina ${word.page}; overgeslagen.`);
    continue;
  }

  const textTransform = pdfjs.Util.transform(source.viewport.transform, item.transform);
  const labelX = textTransform[4];
  const labelY = textTransform[5];
  const above = source.horizontal.filter(line => line < labelY - 2);
  const below = source.horizontal.filter(line => line > labelY + 2);
  if (above.length < 3 || below.length < 1) {
    console.warn(`Tabelrij niet gevonden voor ${word.id} op pagina ${word.page}.`, { labelY, horizontal: source.horizontal });
    continue;
  }

  const top = above[above.length - 3];
  const bottom = below[1] ?? below[0];
  const vertical = findLines(source.image.data, source.canvas.width, source.canvas.height, "vertical", 0, source.canvas.width, (bottom - top) * 0.28, top, bottom);
  const left = vertical.filter(line => line < labelX).at(-1);
  const right = vertical.find(line => line > labelX);
  if (left === undefined || right === undefined || right - left < 45) {
    console.warn(`Kolom niet gevonden voor ${word.id} op pagina ${word.page}.`, { top, bottom, labelX, vertical });
    continue;
  }

  const padding = 3;
  const x = Math.max(0, left - padding);
  const y = Math.max(0, top - padding);
  const width = Math.min(source.canvas.width - x, right - left + padding * 2);
  const height = Math.min(source.canvas.height - y, bottom - top + padding * 2);
  const crop = createCanvas(width, height);
  crop.getContext("2d").drawImage(source.canvas, x, y, width, height, 0, 0, width, height);
  fs.writeFileSync(path.join(output, `${word.id}.jpg`), crop.toBuffer("image/jpeg", 90));
  console.log(`${word.id}: ${width}x${height}px, pagina ${word.page}`);
}