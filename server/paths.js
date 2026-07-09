import path from "node:path";
import { fileURLToPath } from "node:url";

export function isServerless() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
  );
}

export function getProjectRoot() {
  if (isServerless()) {
    return process.cwd();
  }
  if (typeof import.meta.url === "string" && import.meta.url.length > 0) {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(dir, "..");
  }
  return process.cwd();
}

export function getDataDir() {
  if (isServerless()) {
    return "/tmp/rialo-latch";
  }
  return path.join(getProjectRoot(), "data");
}
