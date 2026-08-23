export class CliError extends Error {
  constructor({ command, stage, input, reason, recovery, cause } = {}) {
    super(reason, cause ? { cause } : undefined);
    Object.assign(this, { command, stage, input, reason, recovery });
  }
}

const asOptionName = (value) => (value.startsWith("--") ? value : `--${value}`);

export function parseCli(
  argv,
  { command, usage, positional = [], options = ["--debug"] } = {},
) {
  const args = [...argv];
  const allowed = new Set(options.map(asOptionName));
  const values = {};
  const positionals = [];
  let help = false;
  let debug = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--debug") {
      debug = true;
      continue;
    }
    if (arg.startsWith("-")) {
      const equal = arg.indexOf("=");
      const name = equal === -1 ? arg : arg.slice(0, equal);
      if (!allowed.has(name)) {
        throw new CliError({
          command,
          stage: "arguments",
          reason: `unknown option ${name}`,
          recovery: usage ?? "Run with --help to see the accepted options.",
        });
      }
      const inline = equal === -1 ? undefined : arg.slice(equal + 1);
      if (inline !== undefined) {
        values[name.slice(2)] = inline;
      } else {
        values[name.slice(2)] = true;
      }
      continue;
    }
    positionals.push(arg);
  }

  const requiredPositionals = positional.filter((name) => !name.endsWith("?")).length;
  if (!help && positionals.length > positional.length) {
    throw new CliError({
      command,
      stage: "arguments",
      reason: `expected at most ${positional.length} positional argument${positional.length === 1 ? "" : "s"}`,
      recovery: usage ?? "Run with --help to see the accepted arguments.",
    });
  }
  if (!help && positionals.length < requiredPositionals) {
    throw new CliError({
      command,
      stage: "arguments",
      reason: `expected ${requiredPositionals} positional argument${requiredPositionals === 1 ? "" : "s"}`,
      recovery: usage ?? "Run with --help to see the accepted arguments.",
    });
  }
  if (!help) {
    positional.forEach((name, index) => {
      if (positionals[index] !== undefined) values[name.replace(/\?$/, "")] = positionals[index];
    });
  }

  return { help, debug, values };
}

function safeInput(input) {
  if (input == null) return "";
  const value = String(input);
  return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}

function safeDiagnosticText(value) {
  if (value == null) return "";
  const text = String(value)
    .split(/\r?\n/)
    .filter((line) => !/^\s*at\s+/.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

export function sanitizeDiagnosticPayload(value, { debug = false } = {}) {
  if (debug || value == null) return value;
  if (typeof value === "string") return safeDiagnosticText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeDiagnosticPayload(item, { debug }));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeDiagnosticPayload(item, { debug })]),
    );
  }
  return value;
}

export function formatDiagnostic(error, { debug = false, command } = {}) {
  const diagnostic = error instanceof CliError || (error && typeof error === "object" && "reason" in error)
    ? error
    : new CliError({
        command: "beautidraw",
        stage: "runtime",
        reason: error?.message ?? String(error),
        cause: error,
      });
  const lines = [`${command ?? diagnostic.command ?? "beautidraw"} failed`];
  if (diagnostic.stage) lines.push(`stage: ${diagnostic.stage}`);
  if (diagnostic.input) lines.push(`input: ${safeInput(diagnostic.input)}`);
  if (diagnostic.reason) lines.push(`reason: ${safeDiagnosticText(diagnostic.reason)}`);
  if (diagnostic.recovery) lines.push(`recovery: ${safeDiagnosticText(diagnostic.recovery)}`);
  if (debug && diagnostic.stack) lines.push(`stack:\n${diagnostic.stack}`);
  return lines.join("\n");
}

export async function runCli(
  command,
  main,
  { argv = process.argv.slice(2), usage, stdout = process.stdout, stderr = process.stderr, positional = [], options = ["--debug"] } = {},
) {
  let parsed;
  try {
    parsed = parseCli(argv, { command, usage, positional, options });
  } catch (error) {
    stderr.write(`${formatDiagnostic(error, { debug: argv.some((arg) => arg === "--debug"), command })}\n`);
    return 1;
  }
  if (parsed.help) {
    stdout.write(`${usage ?? `usage: ${command} [options]`}\n`);
    return 0;
  }
  try {
    const result = await main(parsed);
    return typeof result === "number" ? result : 0;
  } catch (error) {
    stderr.write(`${formatDiagnostic(error, { debug: parsed.debug, command })}\n`);
    return 1;
  }
}
