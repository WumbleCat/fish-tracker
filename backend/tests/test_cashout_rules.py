"""One live cash-out per sitting; a rebuy after a verified cash-out opens a
fresh slot (decided 2026-08-23)."""

from sqlalchemy import text

from tests.helpers import (
    auth,
    create_game,
    log_entry,
    logged_verified,
    to_running,
    verify,
)


def _running_game(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    logged_verified(client, player, host, game["id"], "buy_in", 5000)
    return host, player, game


def test_second_pending_cashout_is_rejected(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    log_entry(client, player, game["id"], "cash_out", 3000)
    resp = log_entry(client, player, game["id"], "cash_out", 4000, expect=409)
    assert resp["error"] == "cashout_already_live"


def test_cashout_after_verified_cashout_without_rebuy_is_rejected(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    logged_verified(client, player, host, game["id"], "cash_out", 3000)
    resp = log_entry(client, player, game["id"], "cash_out", 1000, expect=409)
    assert resp["error"] == "cashout_already_live"


def test_rebuy_after_verified_cashout_opens_a_fresh_slot(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    logged_verified(client, player, host, game["id"], "cash_out", 3000)
    # the night reads as one session with multiple sit-downs
    logged_verified(client, player, host, game["id"], "rebuy", 2000)
    second = logged_verified(client, player, host, game["id"], "cash_out", 2500)
    assert second["state"] == "verified"


def test_rejected_cashout_frees_the_slot(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    first = log_entry(client, player, game["id"], "cash_out", 3000)
    client.post(
        f"/api/entries/{first['id']}/reject",
        json={"if_version": first["version"]},
        headers=auth(host),
    )
    second = log_entry(client, player, game["id"], "cash_out", 2800)
    assert second["state"] == "pending"


def test_verifying_a_cashout_respects_the_slot_rule(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    first = log_entry(client, player, game["id"], "cash_out", 3000)
    rejected = client.post(
        f"/api/entries/{first['id']}/reject",
        json={"if_version": first["version"]},
        headers=auth(host),
    ).json()
    second = log_entry(client, player, game["id"], "cash_out", 2800)
    verify(client, host, second)
    # re-verifying the earlier rejected cash-out would create a second live
    # one against the same sitting — refuse it
    resp = client.post(
        f"/api/entries/{rejected['id']}/verify",
        json={"if_version": rejected["version"]},
        headers=auth(host),
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "cashout_already_live"


def test_partial_unique_index_backs_the_service_check(client, make_registered, engine):
    host, player, game = _running_game(client, make_registered)
    log_entry(client, player, game["id"], "cash_out", 3000)
    # sneak past the service straight into the database
    with engine.begin() as conn:
        try:
            conn.execute(
                text(
                    "insert into public.entries "
                    "(game_id, user_id, entry_type, amount_minor, logged_by) "
                    "values (:g, :u, 'cash_out', 999, :u)"
                ),
                {"g": game["id"], "u": str(player["user_id"])},
            )
            assert False, "one_active_cashout index must refuse a second pending cash-out"
        except Exception as e:
            assert "one_active_cashout" in str(e)
