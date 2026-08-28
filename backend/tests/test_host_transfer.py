"""Host transfer is what keeps a game closable when the host goes to the shop
(app-logic). The clients now offer it, so the rules they rely on are pinned
here: who may hand it over, who may receive it, and what a stale screen does."""

from tests.helpers import add_player, auth, create_game, guest_join, join, to_running


def _transfer(client, actor, game_id, user_id, if_version=None, expect=200):
    body = {"user_id": str(user_id)}
    if if_version is not None:
        body["if_version"] = if_version
    resp = client.post(
        f"/api/games/{game_id}/transfer-host", json=body, headers=auth(actor)
    )
    assert resp.status_code == expect, resp.text
    return resp


def test_the_new_host_verifies_and_the_old_one_no_longer_can(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])

    after = _transfer(client, host, game["id"], player["user_id"]).json()

    assert after["host_id"] == str(player["user_id"])
    roles = {m["user_id"]: m["role"] for m in after["members"]}
    assert roles[str(player["user_id"])] == "host"
    assert roles[str(host["user_id"])] == "player"  # demoted, not removed

    # the demoted host is an ordinary player: no verifying from here on
    entry = client.post(
        f"/api/games/{game['id']}/entries",
        json={"entry_type": "buy_in", "amount_minor": 5000},
        headers=auth(host),
    ).json()
    refused = client.post(
        f"/api/entries/{entry['id']}/verify", json={}, headers=auth(host)
    )
    assert refused.status_code == 403
    allowed = client.post(
        f"/api/entries/{entry['id']}/verify", json={}, headers=auth(player)
    )
    assert allowed.status_code == 200


def test_a_player_cannot_hand_the_game_to_themselves(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])

    refused = _transfer(client, player, game["id"], player["user_id"], expect=403)
    assert refused.json()["error"] == "not_host"


def test_a_host_added_player_can_never_receive_it(client, make_registered):
    """They are guest-kind and hold no credential — handing them the game
    would strand it with nobody able to verify."""
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    dave = next(
        m
        for m in add_player(client, host, game["id"], "Dave")["members"]
        if m["display_name"] == "Dave"
    )

    refused = _transfer(client, host, game["id"], dave["user_id"], expect=403)
    assert refused.json()["error"] == "guest_not_permitted"


def test_a_guest_who_joined_is_equally_ineligible(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    guest = guest_join(client, game["join_code"], "Guest")

    refused = _transfer(client, host, game["id"], guest["user_id"], expect=403)
    assert refused.json()["error"] == "guest_not_permitted"


def test_someone_who_has_left_the_table_cannot_be_handed_it(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    left = client.post(f"/api/games/{game['id']}/leave", json={}, headers=auth(player))
    assert left.status_code == 200, left.text

    refused = _transfer(client, host, game["id"], player["user_id"], expect=404)
    assert refused.json()["error"] == "user_not_found"


def test_a_stale_screen_is_refused_rather_than_guessing(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])

    stale = game["version"] - 1
    refused = _transfer(client, host, game["id"], player["user_id"], stale, expect=409)
    assert refused.json()["error"] == "version_conflict"
