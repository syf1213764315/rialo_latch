import path from "node:path";

export function isServerless() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
  );
}

export function getProjectRoot() {
  return process.cwd();
}

export function getDataDir() {
  if (isServerless()) {
    return "/tmp/rialo-latch";
  }
  return path.join(getProjectRoot(), "data");
}
