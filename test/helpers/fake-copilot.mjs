import { readFile, writeFile } from "node:fs/promises";

const [statePath, ...args] = process.argv.slice(2);
const state = JSON.parse(await readFile(statePath, "utf8"));

async function save() {
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function json(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (args[0] === "--version") {
  process.stdout.write("fake-copilot 1.0.0\n");
} else if (args.join(" ") === "plugins marketplace list --json") {
  json(state.marketplaces);
} else if (args[0] === "plugins" && args[1] === "marketplace" && args[2] === "add") {
  if (!state.marketplaces.some((item) => item.name === state.marketplaceName)) {
    state.marketplaces.push({ name: state.marketplaceName, source: args[3] });
    await save();
  }
} else if (args[0] === "plugins" && args[1] === "marketplace" && args[2] === "remove") {
  state.marketplaces = state.marketplaces.filter((item) => item.name !== args[3]);
  state.plugins = state.plugins.filter((item) => item.marketplace !== args[3]);
  await save();
} else if (args[0] === "plugins" && args[1] === "marketplace" && args[2] === "browse") {
  json(state.catalog[args[3]] ?? []);
} else if (args.join(" ") === "plugins list --kind plugin --json") {
  json({
    plugins: state.plugins.map(({ marketplace, ...item }) => ({
      ...item,
      source: item.source ?? (marketplace ? `marketplace:${marketplace}` : undefined),
    })),
    errors: [],
  });
} else if (args[0] === "plugins" && args[1] === "install") {
  const [name, marketplace] = args[2].split("@");
  const existing = state.plugins.find((item) => item.name === name && item.marketplace === marketplace);
  if (existing) {
    existing.enabled = true;
    await save();
  } else {
    const version = state.catalog[marketplace]?.find((item) => item.name === name)?.version ?? "0.1.0";
    state.plugins.push({ name, marketplace, version, enabled: true, source: `marketplace:${marketplace}` });
    await save();
  }
} else if (args[0] === "plugins" && args[1] === "enable") {
  const [name, marketplace] = args[2].split("@");
  const row = state.plugins.find((item) => item.name === name && (!marketplace || item.marketplace === marketplace));
  if (row) row.enabled = true;
  await save();
} else if (args[0] === "plugins" && args[1] === "disable") {
  const [name, marketplace] = args[2].split("@");
  const row = state.plugins.find((item) => item.name === name && (!marketplace || item.marketplace === marketplace));
  if (row) row.enabled = false;
  await save();
} else if (args[0] === "plugins" && args[1] === "update") {
  const [name, marketplace] = args[2].split("@");
  const row = state.plugins.find((item) => item.name === name && (!marketplace || item.marketplace === marketplace));
  if (row) {
    row.version = state.catalog[row.marketplace]?.find((item) => item.name === row.name)?.version ?? row.version;
  }
  await save();
} else {
  process.stderr.write(`Unsupported fake Copilot args: ${args.join(" ")}\n`);
  process.exitCode = 2;
}
