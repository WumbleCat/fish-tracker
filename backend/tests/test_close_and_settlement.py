"""The close gates: pending entries block close, reconciliation is surfaced
and acknowledged, nets sum to zero across a full game, payments reconcile."""

from sqlalchemy import text

from tests.helpers import (
    auth,
    create_game,
    get_game,
    log_entry,
    logged_verified,
    to_running,
    verify,
)


def _settled_two_player_game(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = create_game(client, host)
    game = to_running(client, host, game)
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    logged_verified(client, host, host, game["id"], "buy_in", 10000)
    logged_verified(client, player, host, game["id"], "buy_in", 5000)
    logged_verified(client, host, host, game["id"], "cash_out", 4000)
    logged_verified(client, player, host, game["id"], "cash_out", 11000)
    return host, player, game


def test_pending_entries_block_close(client, make_registered):
    host, player, game = _settled_two_player_game(client, make_registered)
    pending = log_entry(client, player, game["id"], "cash_out", 100, expect=409)
    assert pending["error"] == "cashout_already_live"  # (their cash-out is live)
    # a different player's pending entry blocks close
    extra = log_entry(client, host, game["id"], "rebuy", 2000)
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))
    resp = client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))
    assert resp.status_code == 409
    assert resp.json()["error"] == "pending_entries_block_close"
    assert resp.json()["detail"]["count"] == 1
    # resolving the claim unblocks it
    verify(client, host, extra)
    resp = client.post(
        f"/api/games/{game['id']}/close",
        json={"acknowledge_discrepancy": True},
        headers=auth(host),
    )
    assert resp.status_code == 200


def test_balanced_close_produces_reconciling_settlement(client, make_registered):
    host, player, game = _settled_two_player_game(client, make_registered)
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))
    resp = client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["final"] is True
    assert body["discrepancy_minor"] == 0
    # nets sum to zero across the full game
    nets = {k: v for k, v in body["nets"].items()}
    assert sum(nets.values()) == 0
    assert nets[str(host["user_id"])] == -6000
    assert nets[str(player["user_id"])] == 6000
    # payments reconcile: each player's payments net to exactly their position
    flows = dict.fromkeys(nets, 0)
    for p in body["payments"]:
        flows[p["from_user"]] += p["amount_minor"]
        flows[p["to_user"]] -= p["amount_minor"]
    for user_id, net in nets.items():
        assert flows[user_id] == -net

    game_json = get_game(client, host, game["id"])
    assert game_json["state"] == "closed"
    assert game_json["closed_at"] is not None


def test_reconciliation_gate_requires_acknowledgement(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    logged_verified(client, host, host, game["id"], "buy_in", 10000)
    logged_verified(client, host, host, game["id"], "cash_out", 9000)
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))

    resp = client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))
    assert resp.status_code == 409
    assert resp.json()["error"] == "reconciliation_mismatch"
    assert resp.json()["detail"]["discrepancy_minor"] == 1000

    resp = client.post(
        f"/api/games/{game['id']}/close",
        json={"acknowledge_discrepancy": True},
        headers=auth(host),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["discrepancy_minor"] == 1000
    assert body["acknowledged_by"] == str(host["user_id"])


def test_closed_game_is_read_only(client, make_registered):
    host, player, game = _settled_two_player_game(client, make_registered)
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))
    client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))

    resp = log_entry(client, player, game["id"], "buy_in", 100, expect=409)
    assert resp["error"] == "game_closed"
    resp = client.post(
        f"/api/games/{game['id']}/state", json={"to": "running"}, headers=auth(host)
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "invalid_state_transition"


def test_close_requires_settling_state(client, make_registered):
    host, player, game = _settled_two_player_game(client, make_registered)
    resp = client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))
    assert resp.status_code == 409
    assert resp.json()["error"] == "invalid_state_transition"


def test_settlement_snapshot_is_written_once(client, make_registered, engine):
    host, player, game = _settled_two_player_game(client, make_registered)
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))
    client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))
    # the database's own write-once trigger, not just service behaviour
    with engine.begin() as conn:
        try:
            conn.execute(
                text("update public.settlements set discrepancy_minor = 5 where game_id = :g"),
                {"g": game["id"]},
            )
            assert False, "settlements must be write-once"
        except Exception as e:
            assert "ledger_write_once" in str(e)
