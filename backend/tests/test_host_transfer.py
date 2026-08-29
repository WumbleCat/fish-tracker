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


def test_a_guest_who_joined_can_be_handed_the_game(client, make_registered):
    """They hold a token of their own, so somebody can still act as host
    (app-logic, 2026-08-29). Every host power comes with it."""
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    guest = guest_join(client, game["join_code"], "Guest")

    after = _transfer(client, host, game["id"], guest["user_id"]).json()
    assert after["host_id"] == guest["user_id"]

    # the guest host verifies, and the demoted registered host no longer can
    entry = client.post(
        f"/api/games/{game['id']}/entries",
        json={"entry_type": "buy_in", "amount_minor": 4000},
        headers=auth(host),
    ).json()
    refused = client.post(
        f"/api/entries/{entry['id']}/verify", json={}, headers=auth(host)
    )
    assert refused.status_code == 403
    verified = client.post(
        f"/api/entries/{entry['id']}/verify", json={}, headers=auth(guest["token"])
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["verified_by"] == guest["user_id"]


def test_a_guest_host_can_close_the_game(client, make_registered):
    """A half-host who can verify but not close is a table that jams at
    settlement, so the whole set of powers travels with the game."""
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    guest = guest_join(client, game["join_code"], "Guest")
    _transfer(client, host, game["id"], guest["user_id"])

    logged = client.post(
        f"/api/games/{game['id']}/entries",
        json={"entry_type": "buy_in", "amount_minor": 4000},
        headers=auth(guest["token"]),
    ).json()
    client.post(f"/api/entries/{logged['id']}/verify", json={}, headers=auth(guest["token"]))
    out = client.post(
        f"/api/games/{game['id']}/entries",
        json={"entry_type": "cash_out", "amount_minor": 4000},
        headers=auth(guest["token"]),
    ).json()
    client.post(f"/api/entries/{out['id']}/verify", json={}, headers=auth(guest["token"]))

    to_settling = client.post(
        f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(guest["token"])
    )
    assert to_settling.status_code == 200, to_settling.text
    closed = client.post(
        f"/api/games/{game['id']}/close",
        json={"acknowledge_discrepancy": False},
        headers=auth(guest["token"]),
    )
    assert closed.status_code == 200, closed.text


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


def test_the_api_says_who_can_be_handed_the_game(client, make_registered):
    """Clients render this rather than re-deriving it; two clients deriving
    eligibility separately is two chances to offer a table nobody can run."""
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    guest = guest_join(client, game["join_code"], "Guest")
    after = add_player(client, host, game["id"], "Dave")

    can_host = {m["display_name"]: m["can_host"] for m in after["members"]}
    assert can_host == {"Host": True, "Sam": True, "Guest": True, "Dave": False}
