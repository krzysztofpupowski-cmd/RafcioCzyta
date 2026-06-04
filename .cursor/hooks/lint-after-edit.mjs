#!/usr/bin/env node
/**
 * Runs ESLint on the file the agent just edited.
 * Logs results to stderr (Hooks output channel). Exits 0 so lint failures do not block the agent.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRootFromHook = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const LINTABLE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro"]);

function readInput() {
  // Cursor may prefix stdin with a UTF-8 BOM — strip it before JSON.parse.
  const raw = readFileSync(0, "utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    process.stderr.write(
      `[lint-after-edit] Invalid hook payload: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(0);
  }
}

/** Cursor on Windows may send "/C:/dev/project" — normalize before path.join. */
function normalizeWorkspaceRoot(root) {
  if (!root || typeof root !== "string") return projectRootFromHook;
  if (/^\/[A-Za-z]:/.test(root)) {
    return path.normalize(root.slice(1));
  }
  return path.normalize(root);
}

function resolveFilePath(filePath, workspaceRoot) {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(workspaceRoot, filePath);
}

function eslintExecutable(projectRoot) {
  const base = path.join(projectRoot, "node_modules", ".bin", "eslint");
  const win = `${base}.cmd`;
  if (process.platform === "win32" && existsSync(win)) return win;
  if (existsSync(base)) return base;
  return null;
}

function findProjectRoot(workspaceRoot) {
  const candidates = [
    normalizeWorkspaceRoot(workspaceRoot),
    projectRootFromHook,
    process.cwd(),
  ];
  for (const root of candidates) {
    if (eslintExecutable(root)) return root;
  }
  return normalizeWorkspaceRoot(workspaceRoot);
}

const input = readInput();
const workspaceRoot = findProjectRoot(input.workspace_roots?.[0]);
const filePath = input.file_path;

if (!filePath || typeof filePath !== "string") {
  process.exit(0);
}

const absPath = resolveFilePath(filePath, workspaceRoot);
const ext = path.extname(absPath).toLowerCase();

if (!LINTABLE.has(ext)) {
  process.exit(0);
}

const eslint = eslintExecutable(workspaceRoot);
if (!eslint) {
  process.stderr.write(
    `[lint-after-edit] eslint not found in ${workspaceRoot} — run npm install in the project root.\n`,
  );
  process.exit(0);
}

const result = spawnSync(
  eslint,
  ["--fix", "--max-warnings", "0", absPath],
  {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  },
);

const label = path.relative(workspaceRoot, absPath) || absPath;

if (result.status === 0) {
  process.stderr.write(`[lint-after-edit] OK ${label}\n`);
  process.exit(0);
}

process.stderr.write(`[lint-after-edit] ESLint reported issues in ${label}\n`);
if (result.stdout) process.stderr.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(0);
