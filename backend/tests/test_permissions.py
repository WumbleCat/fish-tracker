"""Host-only actions stay host-only; guests stay in their lane."""

from tests.helpers import (
    auth,
    create_game,
    guest_join,
    log_entry,
    to_running,
)


def _game_with_player_and_guest(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    guest = guest_join(client, game["join_code"], "Charlie")
    return host, player, guest, game


def test_non_host_verify_is_403(client, make_registered):
    host, player, guest, game = _game_with_player_and_guest(client, make_registered)
    entry = log_entry(client, player, game["id"], "buy_in", 4000)
    resp = client.post(f"/api/entries/{entry['id']}/verify", json={}, headers=auth(player))
    assert resp.status_code == 403
    assert resp.json()["error"] == "not_host"


def test_guest_verify_is_403(client, make_registered):
    host, player, guest, game = _game_with_player_and_guest(client, make_registered)
    entry = log_entry(client, guest["token"], game["id"], "buy_in", 4000)
    resp = client.post(
        f"/api/entries/{entry['id']}/verify", json={}, headers=auth(guest["token"])
    )
    assert resp.status_code == 403
    assert resp.json()["error"] == "guest_not_permitted"


def test_guest_can_log_own_entries_only(client, make_registered):
    host, player, guest, game = _game_with_player_and_guest(client, make_registered)
    entry = log_entry(client, guest["token"], game["id"], "buy_in", 2000)
    assert entry["user_id"] == guest["user_id"]
    # logging on someone else's behalf is a host power
    resp = log_entry(
        client, guest["token"], game["id"], "buy_in", 2000,
        target_user_id=player["user_id"], expect=403,
    )
    assert resp["error"] == "guest_not_permitted"


def test_host_can_log_on_behalf(client, make_registered):
    host, player, guest, game = _game_with_player_and_guest(client, make_registered)
    entry = log_entry(
        client, host, game["id"], "rebuy", 2000, target_user_id=player["user_id"]
    )
    # the entry belongs to the player; the action to whoever performed it
    assert entry["user_id"] == str(player["user_id"])
    assert entry["logged_by"] == str(host["user_id"])


def test_guest_is_refused_host_transfer_and_cannot_receive_it(client, make_registered):
    host, player, guest, game = _game_with_player_and_guest(client, make_registered)
    resp = client.post(
        f"/api/games/{game['id']}/transfer-host",
        json={"user_id": guest["user_id"]},
        headers=auth(host),
    )
    assert resp.status_code == 403
    assert resp.json()["error"] == "guest_not_permitted"
    # a registered player is eligible
    resp = client.post(
        f"/api/games/{game['id']}/transfer-host",
        json={"user_id": str(player["user_id"])},
        headers=auth(host),
    )
    assert resp.status_code == 200
    assert resp.json()["host_id"] == str(player["user_id"])


def test_guest_is_refused_payout_details_and_history(client, make_registered):
    host, player, guest, game = _game_with_player_and_guest(client, make_registered)
    for call in (
        lambda: client.get(f"/api/games/{game['id']}/payout-details", headers=auth(guest["token"])),
        lambda: client.get("/api/users/me/history", headers=auth(guest["token"])),
        lambda: client.put(
            "/api/users/me/payout-details",
            json={"account_name": "C", "sort_code": "040004", "account_number": "12345678"},
            headers=auth(guest["token"]),
        ),
    ):
        resp = call()
        assert resp.status_code == 403
        assert resp.json()["error"] == "guest_not_permitted"


def test_guest_cannot_create_a_game(client, make_registered):
    host, player, guest, game = _game_with_player_and_guest(client, make_registered)
    resp = client.post(
        "/api/games", json={"name": "Guest game"}, headers=auth(guest["token"])
    )
    assert resp.status_code == 403
    assert resp.json()["error"] == "guest_not_permitted"


def test_non_host_state_change_is_403(client, make_registered):
    host, player, guest, game = _game_with_player_and_guest(client, make_registered)
    resp = client.post(
        f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(player)
    )
    assert resp.status_code == 403
    assert resp.json()["error"] == "not_host"
