import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
const integrationsFile = path.join(dataDir, "integrations.json");
const fallback = {
  reddit: null,
  twitter: null
};
const writeLocks = new Map();

async function ensureFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(integrationsFile, "utf8");
  } catch {
    await writeFile(integrationsFile, JSON.stringify(fallback, null, 2));
  }
}

async function readIntegrations() {
  await ensureFile();
  const raw = await readFile(integrationsFile, "utf8");

  if (!raw.trim()) {
    return structuredClone(fallback);
  }

  const parsed = JSON.parse(raw);
  return {
    ...structuredClone(fallback),
    ...parsed
  };
}

async function queueWrite(worker) {
  const previous = writeLocks.get(integrationsFile) || Promise.resolve();
  const next = previous.catch(() => undefined).then(worker);
  writeLocks.set(integrationsFile, next);

  try {
    return await next;
  } finally {
    if (writeLocks.get(integrationsFile) === next) {
      writeLocks.delete(integrationsFile);
    }
  }
}

export async function getIntegrationsRecord() {
  return readIntegrations();
}

export async function getProviderRecord(provider) {
  const integrations = await readIntegrations();
  return integrations[provider] || null;
}

export async function updateProviderRecord(provider, updater) {
  return queueWrite(async () => {
    const integrations = await readIntegrations();
    const current = integrations[provider] || null;
    const next = updater(current);
    const updated = {
      ...integrations,
      [provider]: next
    };

    await writeFile(integrationsFile, JSON.stringify(updated, null, 2));
    return next;
  });
}
