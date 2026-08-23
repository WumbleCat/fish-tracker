"""Entry lifecycle: pending vs verified vs rejected vs void, the two totals,
and amendment as a new record."""

from tests.helpers import (
    auth,
    create_game,
    get_game,
    log_entry,
    logged_verified,
    net_of,
    to_running,
    verify,
)


def _running_game(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    return host, player, game


def test_pending_entry_moves_chips_on_table_but_not_the_net(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    log_entry(client, player, game["id"], "buy_in", 5000)

    g = get_game(client, host, game["id"])
    assert net_of(g, player["user_id"])["settleable_minor"] == 0
    assert net_of(g, player["user_id"])["pending_delta_minor"] == -5000
    assert g["totals"]["chips_on_table_minor"] == 5000
    assert g["totals"]["verified_buy_ins_minor"] == 0
    assert g["totals"]["pending_count"] == 1


def test_verifying_moves_the_net(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    entry = log_entry(client, player, game["id"], "buy_in", 5000)
    verify(client, host, entry)

    g = get_game(client, host, game["id"])
    assert net_of(g, player["user_id"])["settleable_minor"] == -5000
    assert net_of(g, player["user_id"])["pending_delta_minor"] == 0
    assert g["totals"]["verified_buy_ins_minor"] == 5000
    assert g["totals"]["chips_on_table_minor"] == 5000


def test_pending_cashout_does_not_move_the_net_until_verified(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    logged_verified(client, player, host, game["id"], "buy_in", 5000)
    cashout = log_entry(client, player, game["id"], "cash_out", 8000)

    g = get_game(client, host, game["id"])
    assert net_of(g, player["user_id"])["settleable_minor"] == -5000
    assert net_of(g, player["user_id"])["pending_delta_minor"] == 8000

    verify(client, host, cashout)
    g = get_game(client, host, game["id"])
    assert net_of(g, player["user_id"])["settleable_minor"] == 3000
    assert net_of(g, player["user_id"])["pending_delta_minor"] == 0


def test_rejected_and_void_count_toward_nothing(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    rejected = log_entry(client, player, game["id"], "buy_in", 4000)
    client.post(
        f"/api/entries/{rejected['id']}/reject",
        json={"note": "you put in 20, not 40"},
        headers=auth(host),
    )
    voided = logged_verified(client, player, host, game["id"], "buy_in", 2000)
    resp = client.post(
        f"/api/entries/{voided['id']}/void",
        json={"reason": "logged twice", "if_version": voided["version"]},
        headers=auth(host),
    )
    assert resp.status_code == 200

    g = get_game(client, host, game["id"])
    assert net_of(g, player["user_id"])["settleable_minor"] == 0
    assert net_of(g, player["user_id"])["pending_delta_minor"] == 0
    assert g["totals"]["chips_on_table_minor"] == 0
    # nothing is deleted: both rows stay visible in the ledger
    states = {e["id"]: e["state"] for e in g["entries"]}
    assert states[rejected["id"]] == "rejected"
    assert states[voided["id"]] == "void"


def test_amend_creates_new_row_and_leaves_rejected_untouched(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    entry = log_entry(client, player, game["id"], "buy_in", 4000)
    rejected = client.post(
        f"/api/entries/{entry['id']}/reject", json={}, headers=auth(host)
    ).json()

    resp = client.post(
        f"/api/entries/{entry['id']}/amend",
        json={"amount_minor": 2000, "if_version": rejected["version"]},
        headers=auth(player),
    )
    assert resp.status_code == 201, resp.text
    amended = resp.json()
    assert amended["id"] != entry["id"]
    assert amended["state"] == "pending"
    assert amended["amends_entry_id"] == entry["id"]
    assert amended["amount_minor"] == 2000

    g = get_game(client, host, game["id"])
    original = next(e for e in g["entries"] if e["id"] == entry["id"])
    assert original["amount_minor"] == 4000
    assert original["state"] == "rejected"


def test_cashout_amend_works_exactly_like_buyin(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    logged_verified(client, player, host, game["id"], "buy_in", 5000)
    cashout = log_entry(client, player, game["id"], "cash_out", 9000)
    rejected = client.post(
        f"/api/entries/{cashout['id']}/reject",
        json={"note": "stack was 8k"},
        headers=auth(host),
    ).json()
    assert rejected["state"] == "rejected"

    resp = client.post(
        f"/api/entries/{cashout['id']}/amend",
        json={"amount_minor": 8000, "if_version": rejected["version"]},
        headers=auth(player),
    )
    assert resp.status_code == 201, resp.text
    amended = resp.json()
    assert amended["entry_type"] == "cash_out"
    assert amended["amends_entry_id"] == cashout["id"]

    g = get_game(client, host, game["id"])
    original = next(e for e in g["entries"] if e["id"] == cashout["id"])
    assert original["amount_minor"] == 9000


def test_amend_of_non_rejected_entry_is_refused(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    entry = log_entry(client, player, game["id"], "buy_in", 4000)
    resp = client.post(
        f"/api/entries/{entry['id']}/amend",
        json={"amount_minor": 2000},
        headers=auth(player),
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "entry_not_rejected"


def test_rejected_entry_can_be_reverified(client, make_registered):
    host, player, game = _running_game(client, make_registered)
    entry = log_entry(client, player, game["id"], "buy_in", 4000)
    rejected = client.post(
        f"/api/entries/{entry['id']}/reject", json={}, headers=auth(host)
    ).json()
    # the rejection was itself the mistake — common enough to support directly
    verified = verify(client, host, rejected)
    assert verified["state"] == "verified"


def test_amount_immutability_is_database_enforced(client, make_registered, engine):
    from sqlalchemy import text

    host, player, game = _running_game(client, make_registered)
    entry = log_entry(client, player, game["id"], "buy_in", 4000)
    with engine.begin() as conn:
        try:
            conn.execute(
                text("update public.entries set amount_minor = 1 where id = :id"),
                {"id": entry["id"]},
            )
            assert False, "amount_minor must be immutable"
        except Exception as e:
            assert "entries_append_only" in str(e)
    with engine.begin() as conn:
        try:
            conn.execute(text("delete from public.entries where id = :id"), {"id": entry["id"]})
            assert False, "entries must never be deleted"
        except Exception as e:
            assert "ledger_no_delete" in str(e)
