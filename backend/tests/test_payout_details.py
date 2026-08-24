"""Bank details: scoped to shared games, masked, and never in the snapshot."""

import json

from sqlalchemy import text

from tests.helpers import auth, create_game, logged_verified, to_running

DETAILS = {
    "account_name": "H Example",
    "sort_code": "040004",
    "account_number": "12345678",
    "revolut_link": "https://revolut.me/hexample",
}


def test_members_see_masked_details_nonmembers_see_nothing(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    outsider = make_registered("outsider@test.local", "Outsider")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))

    resp = client.put("/api/users/me/payout-details", json=DETAILS, headers=auth(host))
    assert resp.status_code == 200

    resp = client.get(f"/api/games/{game['id']}/payout-details", headers=auth(player))
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["account_number_masked"] == "••••5678"
    assert "account_number" not in rows[0]
    assert rows[0]["sort_code"] == "040004"
    # a Revolut link is a public handle — shown in full, no masking
    assert rows[0]["revolut_link"] == "https://revolut.me/hexample"

    # a non-member gets the same shape as a missing game — nothing to probe
    resp = client.get(f"/api/games/{game['id']}/payout-details", headers=auth(outsider))
    assert resp.status_code == 404


def test_settlement_snapshot_never_contains_payout_details(
    client, make_registered, engine
):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    client.put("/api/users/me/payout-details", json=DETAILS, headers=auth(host))

    logged_verified(client, host, host, game["id"], "buy_in", 5000)
    logged_verified(client, player, host, game["id"], "buy_in", 5000)
    logged_verified(client, host, host, game["id"], "cash_out", 2000)
    logged_verified(client, player, host, game["id"], "cash_out", 8000)
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))
    resp = client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))
    assert resp.status_code == 200, resp.text

    with engine.begin() as conn:
        raw = conn.execute(
            text("select payments::text from public.settlements where game_id = :g"),
            {"g": game["id"]},
        ).scalar_one()
    assert "12345678" not in raw
    assert "040004" not in raw
    assert "H Example" not in raw
    for payment in json.loads(raw):
        assert set(payment.keys()) == {"from_user", "to_user", "amount_minor"}


def test_revolut_link_format_is_a_typo_catcher(client, make_registered):
    host = make_registered("host@test.local", "Host")
    for bad in ("revolut.me/", "https://example.com/pay", "not-a-link"):
        resp = client.put(
            "/api/users/me/payout-details",
            json={"revolut_link": bad},
            headers=auth(host),
        )
        assert resp.status_code == 422, f"{bad} should be refused"
    # both bare and https:// forms are fine
    for good in ("revolut.me/hexample", "https://revolut.me/h.example-1"):
        resp = client.put(
            "/api/users/me/payout-details",
            json={"revolut_link": good},
            headers=auth(host),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["revolut_link"] == good


def test_guest_details_are_visible_to_co_players_and_carry_the_bank_name(client, make_registered):
    from tests.helpers import guest_join

    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    guest = guest_join(client, game["join_code"], "Charlie")
    resp = client.put(
        "/api/users/me/payout-details",
        json={**DETAILS, "account_name": "C Example", "bank_name": "Monzo"},
        headers=auth(guest["token"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["bank_name"] == "Monzo"

    rows = client.get(f"/api/games/{game['id']}/payout-details", headers=auth(host)).json()
    charlie = next(r for r in rows if r["display_name"] == "Charlie")
    assert charlie["bank_name"] == "Monzo"
    assert charlie["account_number_masked"] == "••••5678"
    assert "account_number" not in charlie
