import {
  VIEWER_CAMERA_COMMANDS
} from "../../runtime-layers/src/ViewerCameraCommands.js";
import {
  PROGRAM_PLAN_VERSION
} from "./DisposableProgramRun.js";

export class CameraPlanCommitService {
  constructor({
    controller,
    currentBaseVersion = () => 0
  } = {}) {
    if (!controller?.applySequence || !controller?.snapshot) {
      throw new TypeError(
        "CameraPlanCommitService exige controlador de câmera."
      );
    }
    if (typeof currentBaseVersion !== "function") {
      throw new TypeError("currentBaseVersion deve ser função.");
    }
    this.controller = controller;
    this.currentBaseVersion = currentBaseVersion;
  }

  accepts(plan) {
    return Array.isArray(plan?.commands) &&
      plan.commands.length > 0 &&
      plan.commands.every(intent =>
        VIEWER_CAMERA_COMMANDS.includes(intent?.command)
      );
  }

  validate(plan) {
    if (!plan || plan.planVersion !== PROGRAM_PLAN_VERSION) {
      throw new Error("Plano de câmera incompatível.");
    }
    if (!Array.isArray(plan.commands) || !plan.commands.length) {
      throw new Error("Plano de câmera vazio.");
    }
    const current = Number(this.currentBaseVersion());
    if (plan.baseVersion !== current) {
      throw new Error(
        `Plano obsoleto: revisão ${plan.baseVersion}, sandbox ${current}.`
      );
    }
    const commands = structuredClone(plan.commands);
    for (const [index, intent] of commands.entries()) {
      if (
        intent?.sequence !== index ||
        !VIEWER_CAMERA_COMMANDS.includes(intent?.command) ||
        !intent.args ||
        typeof intent.args !== "object" ||
        Array.isArray(intent.args)
      ) {
        throw new Error(
          `Intenção de câmera inválida na posição ${index}.`
        );
      }
    }
    return Object.freeze({
      runId: String(plan.runId),
      baseVersion: plan.baseVersion,
      commands
    });
  }

  commit(plan) {
    const compiled = this.validate(plan);
    const before = this.controller.snapshot();
    const camera = this.controller.applySequence(compiled.commands);
    return Object.freeze({
      changed: true,
      domain: "viewer-camera",
      runId: compiled.runId,
      commandCount: compiled.commands.length,
      before,
      camera
    });
  }
}
