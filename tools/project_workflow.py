#!/usr/bin/env python3
"""Planning/continuity tools. These records are evidence, not Git access control."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
PLAN = Path("docs/project/milestones.json")
ROADMAP = Path("docs/project/ROADMAP.md")
TEMPLATE = Path("docs/PROJECT_SEED_TEMPLATE.md")
STATUSES = {"planned", "implemented-awaiting-review", "accepted", "blocked"}
AUTOMATIC_GATES = [
    ("diff", ["git", "diff", "--check"]),
    ("plan", [sys.executable, "tools/project_workflow.py", "check"]),
    ("workflow", [sys.executable, "tools/test_project_workflow.py"]),
    ("architecture", [sys.executable, "tools/audit_architecture.py"]),
    ("entrypoints", [sys.executable, "tools/audit_web_entrypoints.py"]),
    ("precache", [sys.executable, "tools/generate_pwa_precache.py", "--check"]),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_digest(value):
    return digest(json.dumps(value, sort_keys=True, ensure_ascii=False).encode())


def contract_digest(item):
    # A later status-only commit must not invalidate the accepted contract.
    return json_digest({key: value for key, value in item.items() if key != "status"})


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_plan():
    plan = json.loads((ROOT / PLAN).read_text())
    require(plan.get("schemaVersion") == 1, "schemaVersion do plano incompatível")
    items = plan.get("milestones", [])
    require(bool(items), "Plano sem marcos")
    ids = [item["id"] for item in items]
    require(len(ids) == len(set(ids)), "IDs de marco duplicados")
    seen = set()
    for item in items:
        require(item["status"] in STATUSES, "Status de marco inválido")
        require(set(item["dependsOn"]) <= seen, f"Dependência ausente, fora de ordem ou cíclica: {item['id']}")
        seen.add(item["id"])
        for name in ("title", "outcome", "slices", "acceptance", "sources", "scope", "checks"):
            require(bool(item.get(name)), f"{item['id']}: {name} vazio")
        for source in item["sources"]:
            require(not Path(source).is_absolute() and ".." not in Path(source).parts, "Fonte fora do repositório")
            require((ROOT / source).is_file(), f"Fonte inexistente: {source}")
        for pattern in item["scope"]:
            require(not Path(pattern).is_absolute() and ".." not in Path(pattern).parts, "Escopo fora do repositório")
        checks = item["checks"]
        require(len({c["id"] for c in checks}) == len(checks), "IDs de verificação duplicados")
        require(any(c["kind"] == "human" for c in checks), "Marco sem observação humana")
        require([c["id"] for c in checks if c["kind"] == "automatic"] == ["automatic"], "Gate automático inválido")
        require(all(c["kind"] in {"automatic", "human"} and c["label"] for c in checks), "Tipo de verificação inválido")
    for row in plan.get("continuity", []):
        require(row["previous"] and row["treatment"] and set(row["milestones"]) <= set(ids), "Continuidade sem destino válido")
    return plan


def milestone(plan, name):
    found = next((item for item in plan["milestones"] if item["id"] == name), None)
    require(found is not None, f"Marco inexistente: {name}")
    return found


def render(plan):
    lines = ["# Roadmap — jogos e aplicativos web autocontidos", "",
             "> GERADO de `milestones.json` por `bash tools/seedctl roadmap render`. Não editar esta projeção.", "",
             "Este plano parte do patch 0054nf1. O build executável continua em `apps/web/build-info.json`;",
             "o patch de planejamento não implementa as capacidades futuras nem confirma instalação no telefone.", "",
             "A ordem é por dependências, não por datas prometidas. Uma fatia é um resultado demonstrável.",
             "M6 permite provar portabilidade cedo; a distribuição estável M7 depende da composição M5.", "",
             "| Marco | Dependências | Estado do plano | Resultado |", "|---|---|---|---|"]
    for item in plan["milestones"]:
        lines.append(f"| {item['id']} — {item['title']} | {', '.join(item['dependsOn']) or '—'} | {item['status']} | {item['outcome']} |")
    lines += ["", "Estados do plano não substituem registros de revisão ligados a commits. `accepted` só pode ser",
              "registrado após aceitação humana; um teste omitido ou uma regressão aberta não é aceitação.", "",
              "## Continuidade dos marcos anteriores", "",
              "O snapshot anterior permanece integral no histórico. Itens antigos são reavaliados no código",
              "antes de serem tratados como ausentes; trilha preservada não significa implementação concluída.", "",
              "| Planejamento anterior | Tratamento atual | Destino |", "|---|---|---|"]
    for row in plan.get("continuity", []):
        lines.append(f"| {row['previous']} | {row['treatment']} | {', '.join(row['milestones']) or 'Trilha preservada'} |")
    lines += ["",
              "## Contratos e processo", "",
              "- [Fronteiras, exportação, bibliotecas e documentação](DELIVERY_ARCHITECTURE.md)",
              "- [Ciclo agêntico e revisão humana](AGENT_WORKFLOW.md)",
              "- [Snapshot anterior, apenas histórico](history/ROADMAP_0054NF1.md)", ""]
    for item in plan["milestones"]:
        lines += [f"## {item['id']} — {item['title']}", "", item["outcome"], "", "Fatiamento:", ""]
        lines += [f"{n}. {text}" for n, text in enumerate(item["slices"], 1)]
        lines += ["", "Critérios de saída:", ""] + [f"- {text}" for text in item["acceptance"]]
        lines += ["", "Revisão humana:", ""] + [f"- `{c['id']}`: {c['label']}." for c in item["checks"] if c["kind"] == "human"]
        lines += ["", "Código/evidência de partida: " + ", ".join(f"[`{p}`](../../{p})" for p in item["sources"]) + ".", ""]
    lines += ["## Trilhas preservadas e adiadas", ""] + [f"- {text}" for text in plan["deferred"]]
    return "\n".join(lines) + "\n"


def check_generated(plan):
    require((ROOT / ROADMAP).read_text() == render(plan), "Roadmap desatualizado: execute roadmap render")
    require((ROOT / "PROJECT_SEED.md").read_bytes() == (ROOT / TEMPLATE).read_bytes(), "Seed divergente: execute bash tools/make-project-seed.sh")


def subject():
    require(not git("status", "--porcelain"), "Checkout contém mudanças locais; a revisão exige candidato commitado e limpo")
    return {"commit": git("rev-parse", "HEAD"), "tree": git("rev-parse", "HEAD^{tree}"),
            "build": json.loads((ROOT / "apps/web/build-info.json").read_text())}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    with temp.open("x") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    temp.replace(path)


def file_record(path):
    path = path.resolve()
    require(path.is_file(), f"Evidência ausente: {path}")
    return {"path": str(path), "sha256": digest(path.read_bytes())}


def verify_file(record):
    require(file_record(Path(record["path"]))["sha256"] == record["sha256"], "Evidência alterada após registro")


def validate_review(path, plan, *, current=True, ready=False, stack=()):
    path = path.resolve()
    require(path not in stack, "Ciclo nos registros de revisão")
    record = json.loads(path.read_text())
    require(record.get("schemaVersion") == 1, "Versão de revisão incompatível")
    item = milestone(plan, record["milestone"])
    require(record["milestoneSha256"] == contract_digest(item), "Contrato do marco mudou: preparar nova revisão")
    require(bool(re.fullmatch(r"[0-9a-f]{40,64}", record["subject"]["commit"])), "Commit inválido")
    require(git("rev-parse", record["subject"]["commit"] + "^{tree}") == record["subject"]["tree"], "Árvore do candidato divergente")
    require(json.loads(git("show", record["subject"]["commit"] + ":apps/web/build-info.json")) == record["subject"]["build"], "Build do candidato divergente")
    if current:
        require(record["subject"] == subject(), "Candidato mudou: a revisão anterior não se aplica")
    required = {check["id"]: check for check in item["checks"]}
    require(set(record["checks"]) == set(required), "Verificações obrigatórias ausentes ou desconhecidas")
    dependencies = []
    for receipt in record["prerequisites"]:
        verify_file(receipt)
        dependency = validate_review(Path(receipt["path"]), plan, current=False, ready=True, stack=(*stack, path))
        dependencies.append(dependency["milestone"])
        subprocess.run(["git", "merge-base", "--is-ancestor", dependency["subject"]["commit"], record["subject"]["commit"]], cwd=ROOT, check=True, capture_output=True)
    require(sorted(dependencies) == sorted(item["dependsOn"]), "Dependências sem revisão aceita na ancestralidade do candidato")
    for key, check in record["checks"].items():
        require(check["result"] in {"pending", "passed", "failed"}, "Resultado de verificação inválido")
        if check["result"] != "pending":
            require(bool(check.get("note")) and bool(check.get("evidence")), f"Verificação sem evidência: {key}")
            for evidence in check["evidence"]:
                verify_file(evidence)
            if required[key]["kind"] == "human":
                require(bool(check.get("reviewer")) and bool(check.get("environment")), "Observação humana sem autor/aparelho/navegador")
            else:
                require(len(check["evidence"]) == 1, "Relatório automático ausente ou ambíguo")
                report = json.loads(Path(check["evidence"][0]["path"]).read_text())
                require(report["subject"] == record["subject"], "Testes pertencem a outro candidato")
                require([r["id"] for r in report["results"]] == [key for key, _ in AUTOMATIC_GATES], "Relatório automático incompleto")
                passed = all(r["exitCode"] == 0 for r in report["results"])
                require((check["result"] == "passed") == passed, "Resultado automático contradiz relatório")
        if ready:
            require(check["result"] == "passed", f"Verificação pendente ou falhou: {key}")
    human = record["human"]
    require(human["decision"] in {"pending", "accept", "revise", "reject"}, "Decisão humana inválida")
    if ready:
        require(human["decision"] == "accept" and human.get("reviewer") and human.get("note"), "Aceitação humana ausente")
    return record


def create_review(path, item, prerequisites, plan):
    require(not path.exists(), "Registro já existe; use outro nome para preservar o histórico")
    require(not path.is_relative_to(ROOT), "Guarde revisões fora do checkout para não invalidar sua própria árvore")
    record = {"schemaVersion": 1, "milestone": item["id"], "milestoneSha256": contract_digest(item),
              "subject": subject(), "prerequisites": [file_record(p) for p in prerequisites],
              "checks": {check["id"]: {"result": "pending", "note": "", "evidence": []} for check in item["checks"]},
              "human": {"decision": "pending", "reviewer": "", "note": ""}}
    # Validate dependencies before creating any output.
    dependencies = [validate_review(p, plan, current=False, ready=True) for p in prerequisites]
    require(sorted(d["milestone"] for d in dependencies) == sorted(item["dependsOn"]), "Informe revisões aceitas para todas as dependências")
    for dependency in dependencies:
        subprocess.run(["git", "merge-base", "--is-ancestor", dependency["subject"]["commit"], record["subject"]["commit"]], cwd=ROOT, check=True, capture_output=True)
    write_json(path, record)
    return record


def run_automatic(path, record):
    before = subject()
    require(record["subject"] == before, "Candidato mudou antes dos testes")
    record["human"] = {"decision": "pending", "reviewer": "", "note": ""}
    record["checks"]["automatic"] = {"result": "pending", "note": "", "evidence": []}
    write_json(path, record)
    results = []
    for key, command in AUTOMATIC_GATES:
        try:
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=120)
            results.append({"id": key, "command": command, "exitCode": result.returncode, "stdout": result.stdout, "stderr": result.stderr})
        except (OSError, subprocess.TimeoutExpired) as error:
            results.append({"id": key, "command": command, "exitCode": 124, "stdout": "", "stderr": str(error)})
    require(subject() == before, "Checkout mudou durante os testes; resultados não foram aceitos")
    evidence = path.with_name(path.stem + "-automatic-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f") + ".json")
    write_json(evidence, {"subject": before, "results": results})
    record["checks"]["automatic"] = {"result": "passed" if all(r["exitCode"] == 0 for r in results) else "failed",
                                      "note": "Gates de continuidade, arquitetura, entrada e PWA; não comprovam uso visual ou runtime all.",
                                      "evidence": [file_record(evidence)]}
    record["human"] = {"decision": "pending", "reviewer": "", "note": ""}
    write_json(path, record)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("check", "render", "context"):
        sub.add_parser(name)
    review = sub.add_parser("review").add_subparsers(dest="action", required=True)
    init = review.add_parser("init")
    init.add_argument("milestone")
    init.add_argument("file", type=Path)
    init.add_argument("--prerequisite", type=Path, action="append", default=[])
    for name in ("check", "auto", "record", "decide"):
        command = review.add_parser(name)
        command.add_argument("file", type=Path)
        if name == "record":
            command.add_argument("check")
            command.add_argument("--result", choices=["passed", "failed"], required=True)
            command.add_argument("--evidence", type=Path, required=True)
            command.add_argument("--environment", required=True)
        if name in ("record", "decide"):
            command.add_argument("--reviewer", required=True)
            command.add_argument("--note", required=True)
        if name == "decide":
            command.add_argument("--decision", choices=["accept", "revise", "reject"], required=True)
    args = parser.parse_args()
    plan = load_plan()
    if args.command == "render":
        (ROOT / ROADMAP).write_text(render(plan))
        print("Roadmap regenerado do plano canônico.")
    elif args.command == "check":
        check_generated(plan)
        print("Plano, dependências, fontes e seed coerentes. Isto não é aceitação humana.")
    elif args.command == "context":
        print(json.dumps({"checkout": str(ROOT), "branch": git("branch", "--show-current"),
                          "commit": git("rev-parse", "HEAD"), "changes": git("status", "--short"),
                          "remotes": git("remote", "-v"), "baseline": plan.get("baseline"),
                          "runtime": json.loads((ROOT / "apps/web/build-info.json").read_text()),
                          "milestones": [{k: m[k] for k in ("id", "status", "dependsOn")} for m in plan["milestones"]]}, ensure_ascii=False, indent=2))
    else:
        path = args.file.resolve()
        if args.action == "init":
            create_review(path, milestone(plan, args.milestone), args.prerequisite, plan)
        else:
            record = validate_review(path, plan, ready=args.action == "check")
            item = milestone(plan, record["milestone"])
            if args.action == "auto":
                run_automatic(path, record)
                require(record["checks"]["automatic"]["result"] == "passed", "Gate automático falhou; consulte a evidência")
            elif args.action == "record":
                check = next((c for c in item["checks"] if c["id"] == args.check), None)
                require(check is not None and check["kind"] == "human", "Use auto para verificações automáticas")
                require(args.note.strip() and args.reviewer.strip() and args.environment.strip(), "Registro humano incompleto")
                record["checks"][args.check] = {"result": args.result, "reviewer": args.reviewer, "note": args.note,
                                              "environment": args.environment, "evidence": [file_record(args.evidence)]}
                record["human"] = {"decision": "pending", "reviewer": "", "note": ""}
                write_json(path, record)
            elif args.action == "decide":
                require(args.note.strip() and args.reviewer.strip(), "Decisão sem revisor/justificativa")
                if args.decision == "accept":
                    require(all(c["result"] == "passed" for c in record["checks"].values()), "Há verificações pendentes ou falhas")
                record["human"] = {"decision": args.decision, "reviewer": args.reviewer, "note": args.note,
                                   "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
                write_json(path, record)
        print(f"Revisão: {path}. Nenhuma publicação ou alteração de status do roadmap foi executada.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
