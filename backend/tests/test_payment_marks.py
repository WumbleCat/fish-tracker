"""Paid marks: the host's record that a settlement payment was paid. Beside
the settlement, never inside it; host-only; visible to every member."""

from sqlalchemy import text

from tests.helpers import auth, create_game, logged_verified, to_running


def _settled_game(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    logged_verified(client, host, host, game["id"], "buy_in", 5000)
    logged_verified(client, player, host, game["id"], "buy_in", 5000)
    logged_verified(client, host, host, game["id"], "cash_out", 2000)
    logged_verified(client, player, host, game["id"], "cash_out", 8000)
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))
    return host, player, game


def test_host_marks_a_payment_paid_and_everyone_sees_it(client, make_registered):
    host, player, game = _settled_game(client, make_registered)
    preview = client.get(f"/api/games/{game['id']}/settlement", headers=auth(host)).json()
    [payment] = preview["payments"]
    assert payment["paid"] is False and payment["paid_at"] is None

    resp = client.post(
        f"/api/games/{game['id']}/payments/mark",
        json={"from_user": payment["from_user"], "to_user": payment["to_user"], "paid": True},
        headers=auth(host),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["payments"][0]["paid"] is True

    seen = client.get(f"/api/games/{game['id']}/settlement", headers=auth(player)).json()
    assert seen["payments"][0]["paid"] is True
    assert seen["payments"][0]["paid_at"] is not None

    # unmarking clears it rather than deleting the record
    resp = client.post(
        f"/api/games/{game['id']}/payments/mark",
        json={"from_user": payment["from_user"], "to_user": payment["to_user"], "paid": False},
        headers=auth(host),
    )
    assert resp.json()["payments"][0]["paid"] is False


def test_only_the_host_marks_and_only_once_play_has_stopped(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    body = {"from_user": str(player["user_id"]), "to_user": str(host["user_id"]), "paid": True}
    # running: too early
    resp = client.post(f"/api/games/{game['id']}/payments/mark", json=body, headers=auth(host))
    assert resp.status_code == 409
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))
    # a player may not mark
    resp = client.post(f"/api/games/{game['id']}/payments/mark", json=body, headers=auth(player))
    assert resp.status_code == 403


def test_marks_survive_close_and_stay_out_of_the_snapshot(client, make_registered, engine):
    host, player, game = _settled_game(client, make_registered)
    [payment] = client.get(f"/api/games/{game['id']}/settlement", headers=auth(host)).json()["payments"]
    client.post(
        f"/api/games/{game['id']}/payments/mark",
        json={"from_user": payment["from_user"], "to_user": payment["to_user"], "paid": True},
        headers=auth(host),
    )
    closed = client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))
    assert closed.status_code == 200, closed.text
    assert closed.json()["payments"][0]["paid"] is True
    with engine.begin() as conn:
        raw = conn.execute(
            text("select payments::text from public.settlements where game_id = :g"),
            {"g": game["id"]},
        ).scalar_one()
    assert "paid" not in raw
