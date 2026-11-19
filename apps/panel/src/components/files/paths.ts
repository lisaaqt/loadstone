export function joinPath(dir: string, name: string) {
  return `${dir.replace(/\/+$/, "")}/${name}`.replace(/\/+/g, "/");
}

export function dirname(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}`;
}

export function isArchive(name: string) {
  return /\.(zip|tar\.gz|tgz|tar)$/i.test(name);
}
