import {
  createGameRuntimeTests
} from "../packages/runtime-test-plugin/src/GameRuntimeTests.js";

const selected = [
  "delta afim do apoio transporta o personagem sem virar locomoção",
  "mundo cinemático substitui somente o proprietário animado",
  "runtime acompanha plataforma animada e conserva apoio"
];
const tests = createGameRuntimeTests();
let passed = 0;
for (const name of selected) {
  const test = tests[name];
  if (typeof test !== "function") throw new Error(`Teste ausente: ${name}.`);
  try {
    await test();
    passed += 1;
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
console.log(`${passed}/${selected.length} kinematic platform tests passed`);
