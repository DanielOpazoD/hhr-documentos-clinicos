import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "./manifest.mjs";

export class LocalR2Store {
  constructor(root) {
    this.root = root;
    this.blobsRoot = join(root, "blobs");
    this.metadataRoot = join(root, "metadata");
  }

  async init() {
    await Promise.all([
      mkdir(this.blobsRoot, { recursive: true }),
      mkdir(this.metadataRoot, { recursive: true }),
    ]);
  }

  async put(key, body, { owner, contentType }) {
    await this.init();
    const bytes = Buffer.from(body);
    const storageId = sha256(key);
    await Promise.all([
      writeFile(join(this.blobsRoot, `${storageId}.blob`), bytes, { mode: 0o600 }),
      writeFile(join(this.metadataRoot, `${storageId}.json`), JSON.stringify({
        storageId,
        key,
        owner,
        contentType,
      }), { mode: 0o600 }),
    ]);
  }

  async list() {
    let names = [];
    try {
      names = (await readdir(this.metadataRoot)).filter((name) => name.endsWith(".json")).toSorted();
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    return Promise.all(names.map(async (name) => {
      const metadata = JSON.parse(await readFile(join(this.metadataRoot, name), "utf8"));
      const metadataId = name.slice(0, -5);
      const blobPath = join(this.blobsRoot, `${metadata.storageId}.blob`);
      try {
        const body = await readFile(blobPath);
        return {
          ...metadata,
          metadataId,
          blobPath,
          size: body.byteLength,
          contentSha256: sha256(body),
          missing: false,
        };
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        return { ...metadata, metadataId, blobPath, size: null, contentSha256: null, missing: true };
      }
    }));
  }

  async deleteBlob(key) {
    await rm(join(this.blobsRoot, `${sha256(key)}.blob`), { force: true });
  }

  async duplicateObject(key) {
    const sourceId = sha256(key);
    const metadata = JSON.parse(await readFile(join(this.metadataRoot, `${sourceId}.json`), "utf8"));
    const duplicateId = sha256(`duplicate:${key}`);
    await Promise.all([
      writeFile(join(this.blobsRoot, `${duplicateId}.blob`), await readFile(join(this.blobsRoot, `${sourceId}.blob`)), { mode: 0o600 }),
      writeFile(join(this.metadataRoot, `${duplicateId}.json`), JSON.stringify({
        ...metadata,
        storageId: duplicateId,
      }), { mode: 0o600 }),
    ]);
  }
}
