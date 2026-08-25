"""Concurrency stress for the fish-tracker backend.

Serial tests prove the rules; this proves they survive several phones writing
at once. Run against a LOCAL stack only — it truncates. Non-zero exit on any
assertion failure.

    cd backend && uv run uvicorn app.main:app --port 8000
    cd backend && uv run python ../.claude/skills/test-sweep/scripts/stress.py

The run ends on a full ledger: every player's buy-ins, cash-outs and net,
plus the biggest winner and biggest loser. Nets are read from the API's
`nets[].settleable_minor` — this script never computes a net of its own.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx
import jwt
from sqlalchemy import create_engine, text

LOOPBACK = {"127.0.0.1", "localhost", "::1", "[::1]"}
DEFAULT_DB = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
DEFAULT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"
SEAT_LIMIT = 9  # host included — supabase/migrations/*_table_capacity.sql
RACED = 10  # entries put through the verify race
SYMBOLS = {"GBP": "£", "USD": "$", "EUR": "€"}

failures: list[str] = []


def check(ok: bool, label: str, detail: str = "") -> bool:
    if ok:
        print(f"  PASS  {label}")
    else:
        failures.append(f"{label}: {detail}" if detail else label)
        print(f"  FAIL  {label}  {detail}")
    return ok


def percentiles(samples: list[float]) -> str:
    if not samples:
        return "no samples"
    s = sorted(samples)

    def at(q: float) -> float:
        return s[min(len(s) - 1, int(len(s) * q))] * 1000

    return f"p50 {at(0.5):.0f}ms · p95 {at(0.95):.0f}ms · max {s[-1] * 1000:.0f}ms"


def fmt_money(minor: int, exponent: int, currency: str, signed: bool = False) -> str:
    """Display edge only — integer arithmetic the whole way down, never a
    float. Minor units are the only representation anything else touches."""
    sign = "-" if minor < 0 else ("+" if signed and minor > 0 else "")
    a = abs(minor)
    if exponent > 0:
        scale = 10**exponent
        body = f"{a // scale}.{a % scale:0{exponent}d}"
    else:
        body = str(a)
    return f"{sign}{SYMBOLS.get(currency, currency + ' ')}{body}"


# ---------------------------------------------------------------- fixtures


def guard_loopback(database_url: str) -> None:
    host = urlsplit(database_url.replace("postgresql+psycopg", "postgresql")).hostname
    if host not in LOOPBACK:
        sys.exit(f"refusing to run: {host!r} is not loopback. This script truncates.")


def reset_and_seed(database_url: str, secret: str, count: int) -> list[dict]:
    """Clean slate, then mint registered users the way Supabase Auth would —
    inserting into auth.users fires the on_auth_user_created trigger that
    creates the public.users row."""
    engine = create_engine(database_url)
    run = uuid.uuid4().hex[:8]
    users: list[dict] = []
    with engine.begin() as conn:
        conn.execute(
            text(
                "truncate table public.entries, public.settlements, "
                "public.adjustments, public.game_members, public.payout_details, "
                "public.push_tokens, public.games, public.users cascade"
            )
        )
        conn.execute(text("delete from auth.identities"))
        conn.execute(text("delete from auth.users"))
        for i in range(count):
            auth_id = uuid.uuid4()
            email = f"stress-{run}-{i}@test.local"
            name = "Host" if i == 0 else f"Player {i}"
            meta = '{"display_name": "' + name + '"}'
            conn.execute(
                text(
                    "insert into auth.users (id, aud, role, email, raw_user_meta_data) "
                    "values (:id, 'authenticated', 'authenticated', :email, "
                    "cast(:meta as jsonb))"
                ),
                {"id": str(auth_id), "email": email, "meta": meta},
            )
            user_id = conn.execute(
                text("select id from public.users where auth_user_id = :a"),
                {"a": str(auth_id)},
            ).scalar_one()
            token = jwt.encode(
                {
                    "sub": str(auth_id),
                    "aud": "authenticated",
                    "role": "authenticated",
                    "email": email,
                    "exp": datetime.now(timezone.utc) + timedelta(hours=2),
                },
                secret,
                algorithm="HS256",
            )
            users.append({"user_id": str(user_id), "token": token, "name": name})
    engine.dispose()
    return users


def hdr(user: dict) -> dict:
    return {"Authorization": f"Bearer {user['token']}"}


def count_entries(database_url: str, game_id: str) -> tuple[int, int]:
    engine = create_engine(database_url)
    with engine.connect() as conn:
        total = conn.execute(
            text("select count(*) from public.entries where game_id = :g"), {"g": game_id}
        ).scalar_one()
        verified = conn.execute(
            text(
                "select count(*) from public.entries "
                "where game_id = :g and state = 'verified'"
            ),
            {"g": game_id},
        ).scalar_one()
    engine.dispose()
    return total, verified


def split_pot(pot: int, players: int) -> list[int]:
    """Deal the pot out unevenly but exactly — integer shares that sum to the
    pot, so the game reconciles and there is a real winner and a real loser.
    The remainder rides on the last share rather than being rounded away."""
    weights = list(range(1, players + 1))
    total_w = sum(weights)
    shares = [pot * w // total_w for w in weights[:-1]]
    shares.append(pot - sum(shares))
    return shares


# ------------------------------------------------------------------ phases


async def phase_health(client: httpx.AsyncClient, n: int) -> None:
    print(f"\n[1/5] health flood — {n} concurrent /api/health")
    lat: list[float] = []

    async def one():
        t = time.perf_counter()
        try:
            r = await client.get("/api/health")
        except Exception as exc:  # connection refused, pool timeout, reset
            return type(exc).__name__
        lat.append(time.perf_counter() - t)
        if r.status_code != 200:
            return f"status {r.status_code}"
        return None if r.json().get("db") == "ok" else "db unavailable"

    bad = [b for b in await asyncio.gather(*(one() for _ in range(n))) if b]
    check(not bad, "every health probe 200 with db ok", f"{len(bad)}/{n} bad: {bad[:3]}")
    print(f"        {percentiles(lat)}")


async def phase_entry_storm(
    client: httpx.AsyncClient, players: list[dict], game_id: str, rounds: int
) -> list[dict]:
    total = len(players) * rounds
    print(f"\n[2/5] entry storm — {len(players)} players × {rounds} buy-ins, all at once")
    lat: list[float] = []

    async def one(player: dict, i: int):
        t = time.perf_counter()
        try:
            r = await client.post(
                f"/api/games/{game_id}/entries",
                json={"entry_type": "buy_in", "amount_minor": 1000 + i},
                headers=hdr(player),
            )
        except Exception as exc:
            return None, type(exc).__name__
        lat.append(time.perf_counter() - t)
        if r.status_code != 201:
            return None, f"{r.status_code} {r.text[:120]}"
        return r.json(), None

    results = await asyncio.gather(*(one(p, i) for p in players for i in range(rounds)))
    created = [e for e, _ in results if e]
    errs = [e for _, e in results if e]
    check(not errs, f"all {total} buy-ins accepted", f"{len(errs)} failed: {errs[:3]}")

    ids = {e["id"] for e in created}
    check(
        len(ids) == len(created),
        "no duplicate entry ids returned",
        f"{len(created)} rows, {len(ids)} distinct",
    )
    print(f"        {percentiles(lat)}")
    return created


async def phase_verify_race(
    client: httpx.AsyncClient, host: dict, entries: list[dict], racers: int
) -> None:
    print(f"\n[3/5] verify race — {racers} concurrent verifies per entry, same if_version")
    if not entries:
        check(False, "entries available to race", "entry storm produced none")
        return
    sample = entries[: min(RACED, len(entries))]

    async def race(entry: dict):
        async def once():
            try:
                r = await client.post(
                    f"/api/entries/{entry['id']}/verify",
                    json={"if_version": entry["version"]},
                    headers=hdr(host),
                )
                return r.status_code
            except Exception as exc:
                return type(exc).__name__

        codes = await asyncio.gather(*(once() for _ in range(racers)))
        return entry["id"], codes

    bad = []
    for entry_id, codes in await asyncio.gather(*(race(e) for e in sample)):
        winners = [c for c in codes if c == 200]
        conflicts = [c for c in codes if c == 409]
        if len(winners) != 1 or len(winners) + len(conflicts) != len(codes):
            bad.append((entry_id, sorted(set(map(str, codes))), len(winners)))

    check(
        not bad,
        f"exactly one winner per raced entry ({len(sample)} entries × {racers})",
        f"{len(bad)} broke: {bad[:2]}",
    )


async def phase_settle_up(
    client: httpx.AsyncClient,
    host: dict,
    players: list[dict],
    game_id: str,
    buy_ins: list[dict],
) -> int:
    """Verify the rest of the buy-ins, then cash everyone out for exactly the
    pot. A balanced game is the point: it lets the summary assert that the
    nets sum to zero instead of merely printing them."""
    print(f"\n[4/5] settle-up — verify remaining buy-ins, then one cash-out each")

    rest = buy_ins[RACED:]

    async def verify(entry: dict):
        try:
            r = await client.post(
                f"/api/entries/{entry['id']}/verify",
                json={"if_version": entry["version"]},
                headers=hdr(host),
            )
            return None if r.status_code == 200 else f"{r.status_code} {r.text[:80]}"
        except Exception as exc:
            return type(exc).__name__

    bad = [b for b in await asyncio.gather(*(verify(e) for e in rest)) if b]
    check(not bad, f"remaining {len(rest)} buy-ins verified", f"{len(bad)}: {bad[:3]}")

    pot = sum(e["amount_minor"] for e in buy_ins)
    shares = split_pot(pot, len(players))

    # Each player fires two identical cash-outs at once. One live cash-out per
    # sitting is the rule; the duplicate must be refused, not silently taken.
    async def double_cash_out(player: dict, amount: int):
        async def once():
            try:
                r = await client.post(
                    f"/api/games/{game_id}/entries",
                    json={"entry_type": "cash_out", "amount_minor": amount},
                    headers=hdr(player),
                )
                return r.status_code, r.json()
            except Exception as exc:
                return type(exc).__name__, None

        return await asyncio.gather(once(), once())

    accepted: list[dict] = []
    slot_breaks = []
    for player, outcome in zip(
        players,
        await asyncio.gather(
            *(double_cash_out(p, a) for p, a in zip(players, shares))
        ),
    ):
        created = [body for code, body in outcome if code == 201]
        refused = [body for code, body in outcome if code == 409]
        if len(created) != 1 or len(refused) != 1:
            slot_breaks.append((player["name"], [c for c, _ in outcome]))
        elif refused[0].get("error") != "cashout_already_live":
            slot_breaks.append((player["name"], refused[0].get("error")))
        accepted.extend(created)

    check(
        not slot_breaks,
        "one live cash-out per player under a concurrent duplicate",
        f"{len(slot_breaks)} broke: {slot_breaks[:2]}",
    )

    bad = [b for b in await asyncio.gather(*(verify(e) for e in accepted)) if b]
    check(not bad, f"all {len(accepted)} cash-outs verified", f"{len(bad)}: {bad[:3]}")
    return len(accepted)


async def phase_soak(
    client: httpx.AsyncClient, readers: list[dict], game_id: str, seconds: int, conc: int
) -> None:
    print(f"\n[5/5] read soak — {conc} concurrent readers for {seconds}s")
    deadline = time.perf_counter() + seconds
    lat: list[float] = []
    server_errors: list[str] = []
    conn_errors: list[str] = []
    hits = 0

    async def reader(user: dict):
        nonlocal hits
        while time.perf_counter() < deadline:
            t = time.perf_counter()
            try:
                r = await client.get(f"/api/games/{game_id}", headers=hdr(user))
            except Exception as exc:
                conn_errors.append(type(exc).__name__)
                continue
            lat.append(time.perf_counter() - t)
            hits += 1
            if r.status_code >= 500:
                server_errors.append(f"{r.status_code} {r.text[:80]}")

    await asyncio.gather(*(reader(readers[i % len(readers)]) for i in range(conc)))
    check(
        not server_errors,
        "zero 5xx over the soak window",
        f"{len(server_errors)}: {server_errors[:2]}",
    )
    check(
        not conn_errors,
        "zero connection errors over the soak window",
        f"{len(conn_errors)}: {conn_errors[:3]}",
    )
    print(f"        {hits} requests · {percentiles(lat)}")


# ----------------------------------------------------------------- summary


def build_ledger(game: dict) -> list[dict]:
    """One row per seated player. Buy-ins and cash-outs are tallies of the
    verified entries the API returned; `net_minor` is the API's own
    settleable figure, never a subtraction done here — the backend is the
    only authority on what a player is owed. Pending is reported alongside
    and never folded in."""
    names = {m["user_id"]: m["display_name"] for m in game["members"]}
    nets = {n["user_id"]: n for n in game["nets"]}

    tally: dict[str, dict] = {
        uid: {"user_id": uid, "name": name, "buy_ins_minor": 0, "cash_outs_minor": 0}
        for uid, name in names.items()
    }
    for e in game["entries"]:
        row = tally.get(e["user_id"])
        if row is None or e["state"] != "verified":
            continue
        if e["entry_type"] in ("buy_in", "rebuy"):
            row["buy_ins_minor"] += e["amount_minor"]
        elif e["entry_type"] == "cash_out":
            row["cash_outs_minor"] += e["amount_minor"]

    ledger = []
    for uid, row in tally.items():
        net = nets.get(uid, {})
        row["net_minor"] = net.get("settleable_minor", 0)
        row["pending_delta_minor"] = net.get("pending_delta_minor", 0)
        row["pending_count"] = net.get("pending_count", 0)
        ledger.append(row)
    ledger.sort(key=lambda r: r["net_minor"], reverse=True)
    return ledger


def print_ledger(ledger: list[dict], game: dict) -> None:
    cur, exp = game["currency"], game["currency_exponent"]
    money = lambda m, s=False: fmt_money(m, exp, cur, signed=s)  # noqa: E731

    print(f"\n{'-' * 68}\nLedger — {game['name']} ({cur})\n")
    print(f"  {'Player':<14}{'buy-ins':>13}{'cash-outs':>13}{'net':>13}{'pending':>12}")
    for r in ledger:
        pending = (
            f"{r['pending_count']}·{money(r['pending_delta_minor'], True)}"
            if r["pending_count"]
            else "—"
        )
        print(
            f"  {r['name']:<14}{money(r['buy_ins_minor']):>13}"
            f"{money(r['cash_outs_minor']):>13}{money(r['net_minor'], True):>13}"
            f"{pending:>12}"
        )

    played = [r for r in ledger if r["buy_ins_minor"] or r["cash_outs_minor"]]
    if played:
        winner, loser = played[0], played[-1]
        print(f"\n  biggest winner   {winner['name']:<14}{money(winner['net_minor'], True)}")
        print(f"  biggest loser    {loser['name']:<14}{money(loser['net_minor'], True)}")
    else:
        print("\n  no entries — no winner or loser to name")

    totals = game["totals"]
    print(
        f"\n  verified in {money(totals['verified_buy_ins_minor'])}"
        f" · out {money(totals['verified_cash_outs_minor'])}"
        f" · chips on table {money(totals['chips_on_table_minor'])}"
    )


# -------------------------------------------------------------------- main


async def run(args: argparse.Namespace) -> list[dict]:
    seats = min(args.players, SEAT_LIMIT - 1)
    if seats < args.players:
        print(f"note: table seats {SEAT_LIMIT} including the host — using {seats} players")

    users = reset_and_seed(args.database_url, args.jwt_secret, seats + 1)
    host, players = users[0], users[1:]

    limits = httpx.Limits(
        max_connections=args.concurrency, max_keepalive_connections=args.concurrency
    )
    async with httpx.AsyncClient(
        base_url=args.base_url, timeout=args.timeout, limits=limits
    ) as client:
        try:
            await client.get("/api/health")
        except Exception as exc:
            sys.exit(f"no server at {args.base_url}: {type(exc).__name__}: {exc}")

        await phase_health(client, args.concurrency * 4)

        r = await client.post(
            "/api/games",
            json={"name": "stress table", "currency": "GBP"},
            headers=hdr(host),
        )
        if r.status_code != 201:
            sys.exit(f"could not create game: {r.status_code} {r.text}")
        game = r.json()
        for state in ("open", "running"):
            r = await client.post(
                f"/api/games/{game['id']}/state", json={"to": state}, headers=hdr(host)
            )
            if r.status_code != 200:
                sys.exit(f"could not move game to {state}: {r.status_code} {r.text}")

        joins = await asyncio.gather(
            *(
                client.post(
                    "/api/games/join",
                    json={"join_code": game["join_code"]},
                    headers=hdr(p),
                )
                for p in players
            )
        )
        refused = [j.status_code for j in joins if j.status_code != 200]
        check(not refused, f"all {len(players)} players seated", f"refused: {refused}")

        buy_ins = await phase_entry_storm(client, players, game["id"], args.rounds)
        await phase_verify_race(client, host, buy_ins, args.racers)
        cash_outs = await phase_settle_up(client, host, players, game["id"], buy_ins)
        await phase_soak(client, users, game["id"], args.soak_seconds, args.concurrency)

        final = await client.get(f"/api/games/{game['id']}", headers=hdr(host))
        if final.status_code != 200:
            sys.exit(f"could not read the game back: {final.status_code} {final.text}")
        detail = final.json()

    # the database's own count is the arbiter — not what the API said it did
    total, verified = count_entries(args.database_url, game["id"])
    expected = len(buy_ins) + cash_outs
    check(
        total == expected,
        "database row count matches entries created",
        f"db {total}, expected {expected}",
    )
    check(
        verified == expected,
        "every entry ended verified exactly once",
        f"{verified} verified of {expected}",
    )

    ledger = build_ledger(detail)
    print_ledger(ledger, detail)

    # The pot was dealt out in full, so a correct ledger balances. An
    # imbalance here is surfaced, never rounded away.
    imbalance = sum(r["net_minor"] for r in ledger)
    check(
        imbalance == 0,
        "nets sum to zero — the game reconciles",
        f"off by {imbalance} minor units",
    )
    check(
        not any(r["pending_count"] for r in ledger),
        "nothing left pending at the end of the run",
        f"{sum(r['pending_count'] for r in ledger)} still pending",
    )
    return ledger


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--database-url", default=DEFAULT_DB)
    p.add_argument("--jwt-secret", default=DEFAULT_SECRET)
    p.add_argument("--players", type=int, default=8, help=f"capped at {SEAT_LIMIT - 1}")
    p.add_argument("--rounds", type=int, default=6, help="buy-ins per player")
    p.add_argument("--racers", type=int, default=8, help="concurrent verifies per entry")
    p.add_argument("--concurrency", type=int, default=32)
    p.add_argument("--soak-seconds", type=int, default=10)
    p.add_argument("--timeout", type=float, default=30.0)
    p.add_argument("--json", action="store_true", help="also dump the ledger as JSON")
    args = p.parse_args()

    guard_loopback(args.database_url)
    started = time.perf_counter()
    ledger = asyncio.run(run(args))

    if args.json:
        print("\n" + json.dumps(ledger, indent=2))

    print(f"\n{'-' * 68}")
    if failures:
        elapsed = time.perf_counter() - started
        print(f"STRESS FAILED — {len(failures)} assertion(s) in {elapsed:.1f}s")
        for f in failures:
            print(f"  · {f}")
        sys.exit(1)
    print(f"STRESS PASSED in {time.perf_counter() - started:.1f}s")


if __name__ == "__main__":
    main()
