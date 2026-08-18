import {
  createInteractionBindingTests
} from "../packages/runtime-test-plugin/src/InteractionBindingTests.js";

const tests = createInteractionBindingTests();
let passed = 0;
for (const [name, test] of Object.entries(tests)) {
  try {
    await test();
    passed += 1;
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
console.log(`${passed}/${Object.keys(tests).length} interaction binding tests passed`);
