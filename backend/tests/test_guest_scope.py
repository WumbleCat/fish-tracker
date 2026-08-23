"""A guest token names one game and is valid for nothing else; claiming
merges identity without ever moving entries."""

from tests.helpers import auth, create_game, guest_join, log_entry, to_running


def test_guest_token_scoped_to_game_a_is_rejected_on_game_b(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game_a = to_running(client, host, create_game(client, host, name="Game A"))
    game_b = to_running(client, host, create_game(client, host, name="Game B"))
    guest = guest_join(client, game_a["join_code"], "Charlie")

    resp = client.get(f"/api/games/{game_a['id']}", headers=auth(guest["token"]))
    assert resp.status_code == 200

    resp = client.get(f"/api/games/{game_b['id']}", headers=auth(guest["token"]))
    assert resp.status_code == 403
    assert resp.json()["error"] == "guest_not_permitted"

    resp = log_entry(client, guest["token"], game_b["id"], "buy_in", 1000, expect=403)
    assert resp["error"] == "guest_not_permitted"


def test_guest_join_requires_joinable_state(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = create_game(client, host)  # still draft
    resp = client.post(
        "/api/auth/guest",
        json={"join_code": game["join_code"], "display_name": "Early Bird"},
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "game_not_joinable"


def test_claim_merges_identity_without_moving_entries(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    guest = guest_join(client, game["join_code"], "Charlie")
    entry = log_entry(client, guest["token"], game["id"], "buy_in", 2000)

    fresh = make_registered("charlie@test.local", "Charlie R")
    resp = client.post(
        "/api/auth/claim",
        json={"guest_token": guest["token"]},
        headers=auth(fresh),
    )
    assert resp.status_code == 200, resp.text
    claimed = resp.json()
    # the row is the same row — it just gained an identity
    assert claimed["id"] == guest["user_id"]
    assert claimed["is_guest"] is False

    g = client.get(f"/api/games/{game['id']}", headers=auth(host)).json()
    the_entry = next(e for e in g["entries"] if e["id"] == entry["id"])
    assert the_entry["user_id"] == guest["user_id"]


def test_claim_rejected_when_target_already_in_that_game(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    guest = guest_join(client, game["join_code"], "Charlie")

    resp = client.post(
        "/api/auth/claim",
        json={"guest_token": guest["token"]},
        headers=auth(player),
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "claim_target_in_game"


def test_guest_token_refresh_refused_after_close(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    guest = guest_join(client, game["join_code"], "Charlie")
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))
    resp = client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))
    assert resp.status_code == 200

    resp = client.post("/api/auth/guest/refresh", headers=auth(guest["token"]))
    assert resp.status_code == 409
    assert resp.json()["error"] == "game_closed"
