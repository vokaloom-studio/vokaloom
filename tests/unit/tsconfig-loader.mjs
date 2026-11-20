import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, "src");

function resolveLocalFile(candidateBase) {
  const extensions = ["", ".ts", ".tsx", ".js", ".mjs"];
  for (const ext of extensions) {
    const full = `${candidateBase}${ext}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return pathToFileURL(full).href;
    }
  }
  const indexCandidates = ["index.ts", "index.tsx", "index.js"];
  for (const idx of indexCandidates) {
    const full = path.join(candidateBase, idx);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return pathToFileURL(full).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if (specifier === "next/headers") {
      return nextResolve("next/headers.js", context);
    }
    if (specifier.startsWith("@/")) {
      const subPath = specifier.slice(2);
      const [cleanSubPath, query] = subPath.split("?");
      const resolvedUrl = resolveLocalFile(path.join(srcRoot, cleanSubPath));
      if (resolvedUrl) {
        return {
          shortCircuit: true,
          url: query ? `${resolvedUrl}?${query}` : resolvedUrl,
        };
      }
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file://")
    ) {
      const parentDir = path.dirname(new URL(context.parentURL).pathname);
      const [cleanRel, query] = specifier.split("?");
      const resolvedUrl = resolveLocalFile(path.resolve(parentDir, cleanRel));
      if (resolvedUrl) {
        return {
          shortCircuit: true,
          url: query ? `${resolvedUrl}?${query}` : resolvedUrl,
        };
      }
    }
    return nextResolve(specifier, context);
  },
});
