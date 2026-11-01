#!/usr/bin/env python3
"""Compare two term-pass runs from their RECORDED ANSWERS only (no gate, no apply).

Usage: python3 -I compare_runs.py <runs-dir> <runIdA> [<runIdB>]

Per run: completeness (run-end.json), cost, output tokens (mean / p95 nearest-rank / max, thinking
included), segments answered, ops proposed, flags. With two runs: segments whose proposed ops or
flags differ. Raw proposals are what the model asked for; the gate decides what reaches layer 2.
"""
import json
import math
import sys
from collections import Counter


def load(runs_dir, run_id):
    base = f"{runs_dir}/{run_id}"
    end = json.load(open(f"{base}/run-end.json", encoding="utf-8"))
    run = json.load(open(f"{base}/run.json", encoding="utf-8"))
    resp = [json.loads(l) for l in open(f"{base}/responses.jsonl", encoding="utf-8") if l.strip()]
    segs, bad = {}, 0
    out_tok = []
    for r in resp:
        out_tok.append(r["usage"]["output_tokens"])
        texts = [b["text"] for b in r["response"]["content"] if b.get("type") == "text"]
        try:
            ans = json.loads(texts[-1])
        except Exception:
            bad += 1
            continue
        for s in ans.get("segments", []):
            ops = tuple(sorted((o.get("ruling"), o.get("find"), o.get("replace")) for o in s.get("ops", [])))
            flags = tuple(sorted(json.dumps(f, sort_keys=True, ensure_ascii=False) for f in s.get("flags", [])))
            segs[s["id"]] = {"ops": ops, "flags": flags}
    return {"end": end, "run": run, "segs": segs, "bad": bad, "out_tok": out_tok}


def p95(xs):
    s = sorted(xs)
    return s[max(0, math.ceil(0.95 * len(s)) - 1)]


def summary(name, d):
    e = d["end"]
    c = e["counts"]
    ops = sum(len(v["ops"]) for v in d["segs"].values())
    flags = sum(len(v["flags"]) for v in d["segs"].values())
    with_ops = sum(1 for v in d["segs"].values() if v["ops"])
    flag_kinds = Counter(json.loads(f).get("kind", json.loads(f).get("type", "?")) for v in d["segs"].values() for f in v["flags"])
    t = d["out_tok"]
    print(f"== {name}: {e['runId']} status={e['status']} mode={e['mode']} USD {e['totalUsd']:.2f}")
    print(f"   counts: planned {c['planned']} sent {c['sent']} succeeded {c['succeeded']} truncated {c['truncated']} "
          f"refusal {c['refusal']} errored {c['errored']} notSent {c['notSent']} | unparseable answers {d['bad']}")
    print(f"   output tokens mean {sum(t)/len(t):.0f} / p95 {p95(t)} / max {max(t)}")
    print(f"   segments answered {len(d['segs'])}, with ops {with_ops}; ops proposed {ops}; flags {flags} {dict(flag_kinds)}")


def compare(a, b, na, nb):
    ids = sorted(set(a["segs"]) | set(b["segs"]))
    only_a = [i for i in ids if i in a["segs"] and i not in b["segs"]]
    only_b = [i for i in ids if i in b["segs"] and i not in a["segs"]]
    both = [i for i in ids if i in a["segs"] and i in b["segs"]]
    diff_ops = [i for i in both if a["segs"][i]["ops"] != b["segs"][i]["ops"]]
    diff_flags = [i for i in both if a["segs"][i]["flags"] != b["segs"][i]["flags"]]
    print(f"== {na} vs {nb}: segments in both {len(both)}; only in {na} {len(only_a)}, only in {nb} {len(only_b)}")
    print(f"   proposed ops differ on {len(diff_ops)} segments; flags differ on {len(diff_flags)}")
    ops_a = Counter(op for i in both for op in a["segs"][i]["ops"])
    ops_b = Counter(op for i in both for op in b["segs"][i]["ops"])
    print(f"   ops only {na}: {sum((ops_a - ops_b).values())}; ops only {nb}: {sum((ops_b - ops_a).values())}")
    by_rule = Counter()
    for op, n in ((ops_a - ops_b) + (ops_b - ops_a)).items():
        by_rule[op[0]] += n
    print(f"   rulings behind the differing ops (top 12): {by_rule.most_common(12)}")
    return diff_ops, diff_flags


if __name__ == "__main__":
    runs_dir = sys.argv[1]
    a = load(runs_dir, sys.argv[2])
    summary("A", a)
    if len(sys.argv) > 3:
        b = load(runs_dir, sys.argv[3])
        summary("B", b)
        diff_ops, diff_flags = compare(a, b, "A", "B")
        json.dump({"diff_ops": diff_ops, "diff_flags": diff_flags}, open(sys.argv[0].replace(".py", "-out.json"), "w"), indent=1)
