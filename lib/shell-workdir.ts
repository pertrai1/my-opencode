import { resolve } from "node:path";

export function shellWorkingDirectory(input: unknown, location: string): string {
  const workdir = (input as { workdir?: unknown } | undefined)?.workdir;
  return typeof workdir === "string" && workdir.length ? resolve(location, workdir) : location;
}
