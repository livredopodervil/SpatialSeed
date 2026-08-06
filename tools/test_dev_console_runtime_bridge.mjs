import { DevConsole } from "../packages/devtools/src/DevConsole.js?build=20260806-0050b";

const queryCalls = [];
const commandCalls = [];
const devConsole = new DevConsole({
  editor: {}, sandbox: {}, region: {}, renderer: {},
  getDiagnostics: () => ({}),
  commands: {
    describe: () => [],
    execute(id, args) {
      commandCalls.push({ id, args });
      return { id, args };
    }
  },
  queries: {
    execute(id, args) {
      queryCalls.push({ id, args });
      return { id, args };
    }
  }
});

const entries = devConsole.execute([
  "runtime query time.status",
  'runtime query time.domain {"id":"slow"}',
  'runtime command time.domain.pause {"id":"slow"}'
].join("\n"));
if (entries.some(entry => !entry.ok)) throw new Error(JSON.stringify(entries));

const expectedQueries = JSON.stringify([
  { id: "time.status", args: {} },
  { id: "time.domain", args: { id: "slow" } }
]);
if (JSON.stringify(queryCalls) !== expectedQueries) {
  throw new Error(`Consultas divergentes: ${JSON.stringify(queryCalls)}`);
}
const expectedCommands = JSON.stringify([
  { id: "time.domain.pause", args: { id: "slow" } }
]);
if (JSON.stringify(commandCalls) !== expectedCommands) {
  throw new Error(`Comandos divergentes: ${JSON.stringify(commandCalls)}`);
}
console.log("DevConsole runtime bridge: 3/3 testes aprovados.");
