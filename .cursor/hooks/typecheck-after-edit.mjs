#!/usr/bin/env node
/**
 * Runs tsc --noEmit on the whole project after the agent edits a TypeScript file.
 * Logs results to stderr (Hooks output channel). Exits 0 so failures do not block the agent.
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

const CHECKABLE = new Set([".ts", ".tsx"]);

function readInput() {
  const raw = readFileSync(0, "utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    process.stderr.write(
      `[typecheck-after-edit] Invalid hook payload: ${err instanceof Error ? err.message : String(err)}\n`,
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

function tscExecutable(projectRoot) {
  const base = path.join(projectRoot, "node_modules", ".bin", "tsc");
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
    if (tscExecutable(root)) return root;
  }
  return normalizeWorkspaceRoot(workspaceRoot);
}

const input = readInput();
const workspaceRoot = findProjectRoot(input.workspace_roots?.[0]);
const filePath = input.file_path;

if (!filePath || typeof filePath !== "string") {
  process.exit(0);
}

const ext = path.extname(filePath).toLowerCase();

if (!CHECKABLE.has(ext)) {
  process.exit(0);
}

const tsc = tscExecutable(workspaceRoot);
if (!tsc) {
  process.stderr.write(
    `[typecheck-after-edit] tsc not found in ${workspaceRoot} — run npm install in the project root.\n`,
  );
  process.exit(0);
}

const result = spawnSync(tsc, ["--noEmit"], {
  cwd: workspaceRoot,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.status === 0) {
  process.stderr.write(`[typecheck-after-edit] OK (no type errors)\n`);
  process.exit(0);
}

process.stderr.write(`[typecheck-after-edit] Type errors found:\n`);
if (result.stdout) process.stderr.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(0);
