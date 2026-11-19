import fs from "node:fs/promises";
import { imageFor, JAVA_VERSIONS, SOFTWARE_IDS, type ServerSpec } from "@loadstone/shared";
import { config } from "./config.js";
import { hasImage, pullImage } from "./docker.js";

const REFRESH_MS = 24 * 60 * 60 * 1000;

/** Images for current Minecraft versions (Java 21 for 1.20.5+, Java 25 for 26.x) and the Velocity proxy. */
const RECOMMENDED = [imageFor("PAPER", "21"), imageFor("PAPER", "25"), imageFor("VELOCITY", "21")];

function catalogImages() {
  const images = new Set<string>();
  for (const software of SOFTWARE_IDS) {
    if (software === "CUSTOM") continue;
    for (const java of JAVA_VERSIONS) images.add(imageFor(software, java));
  }
  return [...images];
}

/** Images used by servers that already exist on this node, so they stay up to date too. */
async function serverImages() {
  const files = await fs.readdir(config.dirs.meta).catch(() => [] as string[]);
  const images = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        try {
          return (JSON.parse(await fs.readFile(`${config.dirs.meta}/${f}`, "utf8")) as ServerSpec).image;
        } catch {
          return null;
        }
      }),
  );
  return images.filter((i): i is string => Boolean(i));
}

async function imagesToPull() {
  const setting = config.prepull;
  if (setting === "none") return [];
  const base = setting === "all" ? catalogImages() : setting === "recommended" ? RECOMMENDED : setting.split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...base, ...(await serverImages())])];
}

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

/** Downloads (on start) and refreshes (daily) the server images in the background so installs don't wait for them. */
export async function prepullImages(log: Logger, refresh = false) {
  const images = await imagesToPull();
  for (const image of images) {
    if (!refresh && (await hasImage(image))) continue;
    const started = Date.now();
    try {
      await pullImage(image);
      log.info(`image ${image} ${refresh ? "refreshed" : "pre-pulled"} in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      log.warn(`could not pull ${image}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function startImagePrepull(log: Logger) {
  if (config.prepull === "none") return;
  void prepullImages(log);
  setInterval(() => void prepullImages(log, true), REFRESH_MS).unref();
}
