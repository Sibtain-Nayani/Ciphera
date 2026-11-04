"""Keep v3 evaluation imports inside the v3-owned backend tree."""

import ast
import os
from pathlib import Path


def test_evaluation_import_root_is_v3_backend_only():
    v3_root = Path(__file__).resolve().parents[2]
    evaluate_path = v3_root / "evaluate.py"
    tree = ast.parse(evaluate_path.read_text(encoding="utf-8"))

    root_assignment = next(
        node
        for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "BACKEND_IMPORT_ROOT" for target in node.targets)
    )
    insert_call = next(
        node.value
        for node in tree.body
        if isinstance(node, ast.Expr)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Attribute)
        and isinstance(node.value.func.value, ast.Attribute)
        and isinstance(node.value.func.value.value, ast.Name)
        and node.value.func.value.value.id == "sys"
        and node.value.func.value.attr == "path"
        and node.value.func.attr == "insert"
    )

    assert ast.unparse(insert_call.args[1]) == "BACKEND_IMPORT_ROOT"
    compiled_root = compile(ast.Expression(root_assignment.value), str(evaluate_path), "eval")
    import_root = Path(eval(compiled_root, {"os": os, "__file__": str(evaluate_path)})).resolve()
    assert import_root == (v3_root / "backend").resolve()

    repo_root = v3_root.parent
    prototypes = [repo_root / "Ciphera", repo_root / "CipheraV2"]
    assert all(not import_root.is_relative_to(prototype.resolve()) for prototype in prototypes)
