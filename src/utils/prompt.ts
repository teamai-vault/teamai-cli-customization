import readline from "node:readline";
import { createInterface } from "node:readline/promises";

export async function promptText(
  question: string,
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Promise<string> {
  const prompt = createInterface({ input, output });
  try {
    const answer = (await prompt.question(question)).trim();
    if (!answer) throw new Error("Marketplace URL is required.");
    return answer;
  } finally {
    prompt.close();
  }
}

export async function selectRole(
  roles: string[],
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Promise<string> {
  if (roles.length === 0) throw new Error("Marketplace does not contain any Team AI role plugins.");
  readline.emitKeypressEvents(input);
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  let selected = 0;

  const render = (first: boolean) => {
    if (!first) output.write(`\x1b[${roles.length}A`);
    for (const [index, role] of roles.entries()) {
      output.write(`\x1b[2K${index === selected ? "❯" : " "} ${roleLabel(role)}\n`);
    }
  };
  output.write("? Select your role:\n");
  render(true);

  return await new Promise<string>((resolve, reject) => {
    const finish = (error?: Error) => {
      input.off("keypress", onKeypress);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      if (error) reject(error);
      else resolve(roles[selected]);
    };
    const onKeypress = (_text: string, key: readline.Key) => {
      if (key.ctrl && key.name === "c") return finish(new Error("Setup cancelled."));
      if (key.name === "up") selected = (selected + roles.length - 1) % roles.length;
      else if (key.name === "down") selected = (selected + 1) % roles.length;
      else if (key.name === "return") return finish();
      else return;
      render(false);
    };
    input.on("keypress", onKeypress);
  });
}

export function roleLabel(role: string): string {
  if (role === "api" || role === "qa") return role.toUpperCase();
  if (role === "ios") return "iOS";
  if (role === "aos") return "Android";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
