// PreToolUse: block any tool call that touches a .env file.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const { tool_name, tool_input = {} } = JSON.parse(input);

const touched = [tool_input.file_path, tool_input.path, tool_input.command].filter(Boolean).join(" ");
if (/(^|[\s/"'])\.env(\.[\w-]+)?($|[\s"'])/.test(touched)) {
  console.error(`Blocked ${tool_name}: .env holds secrets and is off limits.`);
  process.exit(2);
}
process.exit(0);
