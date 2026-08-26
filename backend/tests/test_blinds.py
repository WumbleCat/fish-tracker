"""Blinds are the table's stakes, not ledger money (app-logic, 2026-08-26).

The rules under test: host-only, changeable until the game finishes, every
change recorded as a game event, and — the one that matters — nothing about
blinds ever reaches a net, a total, reconciliation or a settlement.
"""

from tests.helpers import (
    auth,
    create_game,
    get_game,
    logged_verified,
    net_of,
    to_running,
)


def _set(client, user, game_id, small, big, expect=200, if_version=None):
    body = {"small_blind_minor": small, "big_blind_minor": big}
    if if_version is not None:
        body["if_version"] = if_version
    resp = client.post(f"/api/games/{game_id}/blinds", json=body, headers=auth(user))
    assert resp.status_code == expect, resp.text
    return resp.json()


def _table(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    return host, player, game


def test_blinds_set_at_creation(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = create_game(client, host, small_blind_minor=10, big_blind_minor=20)
    assert game["small_blind_minor"] == 10
    assert game["big_blind_minor"] == 20
    # setting them at creation is not a "change" — nothing to record yet
    assert game["events"] == []


def test_a_game_may_have_no_blinds(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = create_game(client, host)
    assert game["small_blind_minor"] is None
    assert game["big_blind_minor"] is None


def test_host_changes_blinds_mid_game_and_it_is_logged(client, make_registered):
    host, _player, game = _table(client, make_registered)
    _set(client, host, game["id"], 10, 20)
    after = _set(client, host, game["id"], 25, 50)

    assert after["small_blind_minor"] == 25
    assert after["big_blind_minor"] == 50

    events = after["events"]
    assert len(events) == 2
    first, second = events
    # the first setting has no "from" — there were no blinds before it
    assert first["from_small_blind_minor"] is None
    assert first["to_small_blind_minor"] == 10
    assert first["to_big_blind_minor"] == 20
    # the raise carries both sides, so the log can answer "what were we
    # playing at 21:04"
    assert second["event_type"] == "blinds_changed"
    assert second["from_small_blind_minor"] == 10
    assert second["from_big_blind_minor"] == 20
    assert second["to_small_blind_minor"] == 25
    assert second["to_big_blind_minor"] == 50
    assert second["actor_user_id"] == str(host["user_id"])


def test_blinds_never_reach_the_money(client, make_registered):
    """The whole reason blinds are not entries."""
    host, player, game = _table(client, make_registered)
    logged_verified(client, player, host, game["id"], "buy_in", 5000)
    before = get_game(client, host, game["id"])
    settle_before = client.get(
        f"/api/games/{game['id']}/settlement", headers=auth(host)
    ).json()

    _set(client, host, game["id"], 100, 200)
    _set(client, host, game["id"], 500, 1000)
    after = get_game(client, host, game["id"])
    settle_after = client.get(
        f"/api/games/{game['id']}/settlement", headers=auth(host)
    ).json()

    assert after["totals"] == before["totals"]
    assert net_of(after, player["user_id"]) == net_of(before, player["user_id"])
    assert len(after["entries"]) == len(before["entries"])
    # every figure the settlement carries, unmoved by two blind changes
    assert settle_after["nets"] == settle_before["nets"]
    assert settle_after["payments"] == settle_before["payments"]
    assert settle_after["discrepancy_minor"] == settle_before["discrepancy_minor"]
    # and the buy-in with no cash-out against it is still the whole gap
    assert abs(settle_after["discrepancy_minor"]) == 5000


def test_a_player_cannot_change_the_blinds(client, make_registered):
    host, player, game = _table(client, make_registered)
    _set(client, player, game["id"], 10, 20, expect=403)


def test_a_guest_cannot_change_the_blinds(client, make_registered):
    host, _player, game = _table(client, make_registered)
    guest = client.post(
        "/api/auth/guest", json={"join_code": game["join_code"], "display_name": "Gus"}
    ).json()
    _set(client, guest["token"], game["id"], 10, 20, expect=403)


def test_big_blind_below_small_is_refused(client, make_registered):
    host, _player, game = _table(client, make_registered)
    resp = client.post(
        f"/api/games/{game['id']}/blinds",
        json={"small_blind_minor": 50, "big_blind_minor": 20},
        headers=auth(host),
    )
    assert resp.status_code == 422


def test_equal_blinds_are_allowed(client, make_registered):
    host, _player, game = _table(client, make_registered)
    after = _set(client, host, game["id"], 20, 20)
    assert after["small_blind_minor"] == after["big_blind_minor"] == 20


def test_zero_and_negative_blinds_are_refused(client, make_registered):
    host, _player, game = _table(client, make_registered)
    for small, big in ((0, 20), (-10, 20), (10, 0)):
        resp = client.post(
            f"/api/games/{game['id']}/blinds",
            json={"small_blind_minor": small, "big_blind_minor": big},
            headers=auth(host),
        )
        assert resp.status_code == 422, (small, big, resp.text)


def test_setting_the_same_blinds_records_nothing(client, make_registered):
    host, _player, game = _table(client, make_registered)
    _set(client, host, game["id"], 10, 20)
    again = _set(client, host, game["id"], 10, 20)
    # a "changed" row that records no change would be a lie in the log
    assert len(again["events"]) == 1


def test_blinds_cannot_change_once_the_game_is_closed(client, make_registered):
    host, player, game = _table(client, make_registered)
    logged_verified(client, player, host, game["id"], "buy_in", 5000)
    logged_verified(client, player, host, game["id"], "cash_out", 5000)
    client.post(f"/api/games/{game['id']}/state", json={"to": "settling"}, headers=auth(host))
    closed = client.post(
        f"/api/games/{game['id']}/close", json={"acknowledge_discrepancy": False},
        headers=auth(host),
    )
    assert closed.status_code == 200, closed.text
    _set(client, host, game["id"], 10, 20, expect=409)


def test_blinds_are_recorded_against_a_stale_version(client, make_registered):
    host, _player, game = _table(client, make_registered)
    current = get_game(client, host, game["id"])
    _set(client, host, game["id"], 10, 20, if_version=current["version"])
    # the version moved; the same token must now be refused
    _set(client, host, game["id"], 25, 50, expect=409, if_version=current["version"])


def test_events_are_visible_to_every_player(client, make_registered):
    host, player, game = _table(client, make_registered)
    _set(client, host, game["id"], 10, 20)
    seen = get_game(client, player, game["id"])
    assert len(seen["events"]) == 1
    assert seen["events"][0]["to_big_blind_minor"] == 20
