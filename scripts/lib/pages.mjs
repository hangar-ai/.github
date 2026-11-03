// A tab's page: no colour of its own, and nothing from outside the kit.
//
// Both rules are in Hangar's docs (kit-ui.md, "The rules a kit follows"; kits.md, "What its page
// can do"). The second is also enforced by the page's policy at run time, where a stray address
// fails quietly: here it fails where someone reads it.

import fs from "node:fs";
import path from "node:path";
import { isModule } from "./manifest.mjs";

const NAMED_COLOURS =
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " ",
  );
const NAMED = new RegExp(`(?<![-\\w])(?:${NAMED_COLOURS.join("|")})(?![-\\w])`, "i");
const SYSTEM = /(?<![-\w])(?:Canvas|CanvasText|LinkText|VisitedText|ActiveText|ButtonFace|ButtonText|ButtonBorder|FieldText|HighlightText|GrayText|MarkText|SelectedItem|SelectedItemText|AccentColor|AccentColorText)(?![-\w])/;
const LITERAL = /#[0-9a-f]{3,8}\b|(?<![-\w])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

/** Why this sheet's text writes a colour, or null. Comments and tokens do not count. */
export function colourIn(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (/prefers-color-scheme/.test(text)) return "asks prefers-color-scheme: Hangar's theme decides";
  // The values of declarations, each `var(--x)` and string taken out.
  const values = [...text.matchAll(/(?:^|[;{\s])(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;{}]+)/g)]
    .map(([, , value]) => value.replace(/var\(--[\w-]+/g, "var(").replace(/"[^"]*"|'[^']*'/g, '""').replace(/url\([^)]*\)/g, "url()"));
  for (const value of values) {
    const literal = value.match(LITERAL);
    if (literal) return `writes ${literal[0]}`;
    const named = value.match(NAMED) ?? value.match(SYSTEM);
    if (named) return `writes the colour ${named[0]}`;
  }
  return null;
}

const STRIP_JS_COMMENTS = (text) => text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

const NETWORK_IN_JS = [
  [/\bfetch\s*\(/, "fetch"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bnew\s+WebSocket\b/, "WebSocket"],
  [/\bnew\s+EventSource\b/, "EventSource"],
  [/\bsendBeacon\s*\(/, "sendBeacon"],
  [/\bimportScripts\s*\(/, "importScripts"],
  [/\bimport\s*\(\s*["'`](?:https?:)?\/\//, "an import from elsewhere"],
  [/\bfrom\s+["'`](?:https?:)?\/\//, "an import from elsewhere"],
  [/\.(?:src|href)\s*=\s*["'`](?:https?:)?\/\//, "an address from elsewhere"],
];

const COLOUR_IN_JS = /\.style\.\w*(?:[cC]olor|background|fill|stroke)\w*\s*=\s*["'`](?:#|rgb|hsl)/;

const RESOURCE_TAGS = /<(script|link|img|iframe|frame|source|video|audio|track|embed|object|image|use|input|form|base)\b([^>]*)>/gi;
const RESOURCE_ATTRIBUTES = /\b(src|srcset|href|xlink:href|data|poster|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** Why this address leaves the kit, or null. `from` is the page's folder, `root` the kit's. */
function addressProblem(address, from, root) {
  const url = address.trim();
  if (url === "" || url.startsWith("#") || url.startsWith("data:")) return null;
  if (url.startsWith("/_hangar/")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return `${url} is outside the kit`;
  if (url.startsWith("/")) return `${url} leaves the kit: an absolute address is Hangar's, under /_hangar/`;
  const clean = url.split(/[?#]/)[0];
  const target = path.resolve(from, clean);
  if (target !== root && !target.startsWith(root + path.sep)) return `${url} climbs out of the kit`;
  if (!fs.existsSync(target)) return `${url} is not in the kit`;
  return null;
}

export function pageProblems(html, file, root) {
  const problems = [];
  const from = path.dirname(file);
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const source = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const [, tag, attributes] of source.matchAll(RESOURCE_TAGS)) {
    if (tag.toLowerCase() === "base") problems.push(`${relative}: a <base> sends the page's addresses elsewhere`);
    for (const [, name, double, single, bare] of attributes.matchAll(RESOURCE_ATTRIBUTES)) {
      const value = double ?? single ?? bare;
      const addresses = name.toLowerCase() === "srcset" ? value.split(",").map((part) => part.trim().split(/\s+/)[0]) : [value];
      for (const address of addresses) {
        const why = addressProblem(address, from, root);
        if (why) problems.push(`${relative}: <${tag}> ${why}`);
      }
    }
  }
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(source)) problems.push(`${relative}: a refresh sends the page elsewhere`);
  for (const [, css] of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const colour = colourIn(css);
    if (colour) problems.push(`${relative}: its <style> ${colour}`);
    problems.push(...urlsInCss(css, from, root).map((why) => `${relative}: its <style> ${why}`));
  }
  for (const [, css] of source.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) {
    const colour = colourIn(`x{${css}}`);
    if (colour) problems.push(`${relative}: a style attribute ${colour}`);
  }
  const attribute = source.match(/\s(?:fill|stroke|color|bgcolor)\s*=\s*"(#[^"]*|rgb[^"]*|hsl[^"]*)"/i);
  if (attribute) problems.push(`${relative}: an attribute writes the colour ${attribute[1]}`);
  return problems;
}

function urlsInCss(css, from, root) {
  const problems = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const [, double, single, bare] of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    const why = addressProblem(double ?? single ?? bare, from, root);
    if (why) problems.push(why);
  }
  for (const [, address] of text.matchAll(/@import\s+["']([^"']+)["']/gi)) {
    const why = addressProblem(address, from, root);
    if (why) problems.push(why);
  }
  return problems;
}

function filesUnder(folder) {
  const found = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const child = path.join(folder, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(child));
    else if (entry.isFile()) found.push(child);
  }
  return found;
}

/**
 * Every page, sheet and script of the kit's tabs: the folders the entries that are pages sit in,
 * and tabs/. A native tab's entry is a module, not a page: the folder it sits in is not looked
 * through for pages, and the module is looked into by modules.mjs. An entry that leaves the kit
 * is the manifest's to refuse; no folder outside the kit is read for it.
 */
export function tabFiles(root, manifest) {
  const folders = new Set();
  if (fs.existsSync(path.join(root, "tabs"))) folders.add(path.join(root, "tabs"));
  const kept = (file) => file.startsWith(root + path.sep);
  const entries = (Array.isArray(manifest?.tabs) ? manifest.tabs : [])
    .filter((tab) => typeof tab?.entry === "string" && !isModule(tab.entry))
    .map((tab) => path.resolve(root, tab.entry.replaceAll("\\", "/")))
    .filter(kept);
  for (const entry of entries) folders.add(path.dirname(entry));
  const files = new Set();
  for (const folder of folders) {
    if (fs.existsSync(folder) && folder !== root) for (const file of filesUnder(folder)) files.add(file);
    else if (folder === root) for (const entry of entries) if (path.dirname(entry) === root) files.add(entry);
  }
  return [...files];
}

export function checkPages(root, manifest) {
  const real = fs.realpathSync(root);
  const problems = [];
  let usesHangarUi = false;
  for (const file of tabFiles(real, manifest)) {
    const relative = path.relative(real, file).replaceAll("\\", "/");
    const lower = file.toLowerCase();
    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      const html = fs.readFileSync(file, "utf8");
      problems.push(...pageProblems(html, file, real));
      if (html.includes("/_hangar/kit.css") || html.includes("/_hangar/kit-ui.js")) usesHangarUi = true;
      const sdk = html.indexOf("/_hangar/kit.js");
      const behaviours = html.indexOf("/_hangar/kit-ui.js");
      if (behaviours >= 0 && (sdk < 0 || sdk > behaviours)) problems.push(`${relative}: load /_hangar/kit.js before /_hangar/kit-ui.js`);
    } else if (lower.endsWith(".css")) {
      const css = fs.readFileSync(file, "utf8");
      const colour = colourIn(css);
      if (colour) problems.push(`${relative}: ${colour}`);
      problems.push(...urlsInCss(css, path.dirname(file), real).map((why) => `${relative}: ${why}`));
    } else if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
      const text = STRIP_JS_COMMENTS(fs.readFileSync(file, "utf8"));
      for (const [rule, name] of NETWORK_IN_JS) if (rule.test(text)) problems.push(`${relative}: uses ${name}: a page has no network of its own`);
      if (COLOUR_IN_JS.test(text)) problems.push(`${relative}: sets a colour of its own on an element`);
    }
  }
  if (usesHangarUi && typeof manifest?.hangar !== "string") problems.push('hangar-kit.json: a page loads Hangar UI, so the manifest says "hangar": ">=1.9.0"');
  return problems;
}
