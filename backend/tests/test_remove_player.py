"""The host takes someone off the table (app-logic: "Admit / remove player:
host only").

The endpoint existed before either client offered it, so these pin what the
clients are now allowed to rely on. The rule under all of it: removal is
about the seat, never about the ledger — the row stays, the entries stay, and
an unresolved position still blocks close.
"""

from tests.helpers import (
    add_player,
    auth,
    create_game,
    get_game,
    guest_join,
    join,
    log_entry,
    logged_verified,
    net_of,
    to_running,
    verify,
)


def _remove(client, actor, game_id, user_id, if_version=None, expect=200):
    body = {} if if_version is None else {"if_version": if_version}
    resp = client.post(
        f"/api/games/{game_id}/members/{user_id}/remove", json=body, headers=auth(actor)
    )
    assert resp.status_code == expect, resp.text
    return resp


def _member(game_json, user_id):
    return next(m for m in game_json["members"] if m["user_id"] == str(user_id))


def _seated(game_json):
    return [m for m in game_json["members"] if m["departed_at"] is None]


def test_the_host_removes_a_settled_player_and_frees_the_seat(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])

    after = _remove(client, host, game["id"], player["user_id"]).json()

    gone = _member(after, player["user_id"])
    assert gone["departed_at"] is not None
    assert gone["departed_unsettled"] is False
    assert len(_seated(after)) == 1  # the host, alone at the table again


def test_removing_somebody_deletes_nothing_of_theirs(client, make_registered):
    """Their money is still the ledger's. Nothing is deleted, ever."""
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    logged_verified(client, player, host, game["id"], "buy_in", 5000)

    after = _remove(client, host, game["id"], player["user_id"]).json()

    assert len(after["entries"]) == 1
    assert net_of(after, player["user_id"])["settleable_minor"] == -5000


def test_a_player_removed_mid_hand_is_marked_unsettled(client, make_registered):
    """Chips still in front of them: they leave the roster as a problem the
    host has to resolve, not as a tidy departure."""
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    logged_verified(client, player, host, game["id"], "buy_in", 5000)

    after = _remove(client, host, game["id"], player["user_id"]).json()

    assert _member(after, player["user_id"])["departed_unsettled"] is True


def test_a_removed_players_pending_entry_still_blocks_close(client, make_registered):
    """Removal must not be a way to make an unresolved claim go away — that
    would turn the seat control into a settlement control."""
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    log_entry(client, player, game["id"], "buy_in", 5000)

    _remove(client, host, game["id"], player["user_id"])

    client.post(
        f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host)
    )
    refused = client.post(
        f"/api/games/{game['id']}/close", json={}, headers=auth(host)
    )
    assert refused.status_code == 409
    assert refused.json()["error"] == "pending_entries_block_close"


def test_the_host_cannot_remove_themselves(client, make_registered):
    """A hostless game can't be verified or closed. Hand it over first."""
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])

    refused = _remove(client, host, game["id"], host["user_id"], expect=409)
    assert refused.json()["error"] == "host_must_transfer_first"


def test_an_ordinary_player_cannot_remove_anyone(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    other = make_registered("o@test.local", "Ali")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    join(client, other, game["join_code"])

    refused = _remove(client, player, game["id"], other["user_id"], expect=403)
    assert refused.json()["error"] == "not_host"


def test_a_guest_player_cannot_remove_anyone(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    guest = guest_join(client, game["join_code"], "Dave")

    refused = _remove(client, guest, game["id"], player["user_id"], expect=403)
    assert refused.json()["error"] == "not_host"


def test_a_guest_handed_the_game_can_remove_players(client, make_registered):
    """A guest host holds every host power in that game (app-logic,
    2026-08-29) — a half-host who can verify but not manage the table is the
    jam this rule exists to prevent."""
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    guest = guest_join(client, game["join_code"], "Dave")
    client.post(
        f"/api/games/{game['id']}/transfer-host",
        json={"user_id": str(guest["user_id"])},
        headers=auth(host),
    )

    after = _remove(client, guest, game["id"], player["user_id"]).json()

    assert _member(after, player["user_id"])["departed_at"] is not None


def test_a_host_added_player_can_be_removed(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    seated = add_player(client, host, game["id"], "Dave")
    dave = next(m for m in seated["members"] if m["display_name"] == "Dave")

    after = _remove(client, host, game["id"], dave["user_id"]).json()

    assert _member(after, dave["user_id"])["departed_at"] is not None


def test_removing_somebody_twice_leaves_the_row_untouched(client, make_registered):
    """A double-click, or two hosts on two screens. The second call must not
    rewrite when they left, nor re-derive departed_unsettled against a ledger
    that has moved on since."""
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])

    first = _member(_remove(client, host, game["id"], player["user_id"]).json(),
                    player["user_id"])
    second = _member(_remove(client, host, game["id"], player["user_id"]).json(),
                     player["user_id"])

    assert second == first


def test_a_closed_games_roster_does_not_move(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    buy_in = logged_verified(client, player, host, game["id"], "buy_in", 5000)
    assert buy_in["state"] == "verified"
    cash_out = log_entry(client, player, game["id"], "cash_out", 5000)
    verify(client, host, cash_out)
    client.post(
        f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host)
    )
    closed = client.post(f"/api/games/{game['id']}/close", json={}, headers=auth(host))
    assert closed.status_code == 200, closed.text

    refused = _remove(client, host, game["id"], player["user_id"], expect=409)
    assert refused.json()["error"] == "game_closed"


def test_an_abandoned_games_roster_does_not_move(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    abandoned = client.post(
        f"/api/games/{game['id']}/state", json={"to": "abandoned"}, headers=auth(host)
    )
    assert abandoned.status_code == 200, abandoned.text

    refused = _remove(client, host, game["id"], player["user_id"], expect=409)
    assert refused.json()["error"] == "game_closed"


def test_a_stale_screen_is_refused_rather_than_removing_the_wrong_person(
    client, make_registered
):
    """The roster the host is looking at may not be the roster that exists."""
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Sam")
    game = to_running(client, host, create_game(client, host))
    join(client, player, game["join_code"])
    stale_version = get_game(client, host, game["id"])["version"]
    client.post(
        f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host)
    )

    refused = _remove(
        client, host, game["id"], player["user_id"], if_version=stale_version, expect=409
    )
    assert refused.json()["error"] == "version_conflict"


def test_removing_somebody_who_was_never_here(client, make_registered):
    host = make_registered("host@test.local", "Host")
    stranger = make_registered("s@test.local", "Nobody")
    game = to_running(client, host, create_game(client, host))

    refused = _remove(client, host, game["id"], stranger["user_id"], expect=404)
    assert refused.json()["error"] == "user_not_found"
