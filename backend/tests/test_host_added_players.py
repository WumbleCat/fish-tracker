"""The host seats someone who is not using the app, then logs for them
(app-logic, 2026-08-28). The row is guest-kind, holds a seat, and gets no
credential — and its entries are claims like everybody else's."""

from tests.helpers import (
    add_player,
    auth,
    create_game,
    get_game,
    guest_join,
    log_entry,
    net_of,
    to_running,
    verify,
)


def _seated(game_json):
    return [m for m in game_json["members"] if m["departed_at"] is None]


def _member(game_json, name):
    return next(m for m in game_json["members"] if m["display_name"] == name)


def test_host_seats_a_player_by_name_alone(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))

    after = add_player(client, host, game["id"], "Dave")

    dave = _member(after, "Dave")
    assert dave["is_guest"] is True
    assert dave["role"] == "player"
    assert len(_seated(after)) == 2  # the host and Dave


def test_the_row_gets_no_credential(client, make_registered):
    """No token in the response, and none anywhere else: the absence of a key
    is what makes the row host-managed."""
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))

    after = add_player(client, host, game["id"], "Dave")

    assert "token" not in repr(after)


def test_only_the_host_can_seat_someone(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post(
        "/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player)
    )

    refused = client.post(
        f"/api/games/{game['id']}/members",
        json={"display_name": "Dave"},
        headers=auth(player),
    )
    assert refused.status_code == 403
    assert refused.json()["error"] == "not_host"


def test_a_guest_cannot_seat_someone(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    guest = guest_join(client, game["join_code"], "Guest")

    refused = client.post(
        f"/api/games/{game['id']}/members",
        json={"display_name": "Dave"},
        headers=auth(guest["token"]),
    )
    assert refused.status_code == 403
    # a guest who is not the host; a guest who IS the host may seat players
    assert refused.json()["error"] == "not_host"


def test_the_host_logs_their_buy_in_and_it_is_a_claim(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    dave = _member(add_player(client, host, game["id"], "Dave"), "Dave")

    entry = log_entry(client, host, game["id"], "buy_in", 5000, dave["user_id"])

    # the entry belongs to Dave; the action to the host who performed it
    assert entry["user_id"] == dave["user_id"]
    assert entry["logged_by"] == str(host["user_id"])
    # and it is pending, exactly like every other claim — never auto-verified
    assert entry["state"] == "pending"
    assert entry["verified_at"] is None

    g = get_game(client, host, game["id"])
    assert g["totals"]["chips_on_table_minor"] == 5000  # pending chips are on the table
    assert g["totals"]["verified_buy_ins_minor"] == 0  # but settle nothing
    assert net_of(g, dave["user_id"])["settleable_minor"] == 0
    assert net_of(g, dave["user_id"])["pending_delta_minor"] == -5000


def test_once_verified_it_settles_like_any_buy_in(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    dave = _member(add_player(client, host, game["id"], "Dave"), "Dave")

    entry = log_entry(client, host, game["id"], "buy_in", 5000, dave["user_id"])
    verified = verify(client, host, entry)

    assert verified["state"] == "verified"
    assert verified["verified_by"] == str(host["user_id"])
    g = get_game(client, host, game["id"])
    assert g["totals"]["verified_buy_ins_minor"] == 5000
    assert net_of(g, dave["user_id"])["settleable_minor"] == -5000


def test_their_pending_entry_blocks_close_like_anyone_else(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    dave = _member(add_player(client, host, game["id"], "Dave"), "Dave")
    log_entry(client, host, game["id"], "buy_in", 5000, dave["user_id"])
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))

    refused = client.post(
        f"/api/games/{game['id']}/close",
        json={"acknowledge_discrepancy": True},
        headers=auth(host),
    )
    assert refused.status_code == 409
    assert refused.json()["error"] == "pending_entries_block_close"


def test_they_take_a_seat_and_the_twelfth_is_refused(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    for i in range(10):  # host + 10 = 11
        add_player(client, host, game["id"], f"P{i}")

    refused = client.post(
        f"/api/games/{game['id']}/members",
        json={"display_name": "Twelfth"},
        headers=auth(host),
    )
    assert refused.status_code == 409
    assert refused.json() == {"error": "table_full", "detail": {"seats": 11}}


def test_a_draft_game_is_not_seating_anyone_yet(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = create_game(client, host)  # still draft

    refused = client.post(
        f"/api/games/{game['id']}/members",
        json={"display_name": "Dave"},
        headers=auth(host),
    )
    assert refused.status_code == 409
    assert refused.json()["error"] == "game_not_joinable"


def test_a_blank_name_is_refused(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))

    refused = client.post(
        f"/api/games/{game['id']}/members", json={"display_name": ""}, headers=auth(host)
    )
    assert refused.status_code == 422
