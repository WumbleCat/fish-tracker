"""A table seats at most eleven, host included (app-logic, 2026-08-26,
superseding the nine of 2026-08-24). The twelfth join is refused as a normal
condition; a departed player frees their seat."""

from app.services.seats import MAX_SEATS
from tests.helpers import auth, create_game, to_running


def _join(client, user, code, expect):
    resp = client.post("/api/games/join", json={"join_code": code}, headers=auth(user))
    assert resp.status_code == expect, resp.text
    return resp


def test_the_limit_is_eleven(client):
    # the number itself is the rule; a silent drift back to nine would let
    # every other test here pass while the table shrank
    assert MAX_SEATS == 11


def test_twelfth_registered_player_is_refused(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    players = [make_registered(f"p{i}@test.local", f"P{i}") for i in range(11)]
    for p in players[:10]:  # host + 10 = 11 seats
        _join(client, p, game["join_code"], 200)
    refused = _join(client, players[10], game["join_code"], 409)
    assert refused.json() == {"error": "table_full", "detail": {"seats": 11}}


def test_twelfth_guest_is_refused_the_same_way(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    for i in range(10):
        resp = client.post(
            "/api/auth/guest", json={"join_code": game["join_code"], "display_name": f"G{i}"}
        )
        assert resp.status_code == 200, resp.text
    refused = client.post(
        "/api/auth/guest", json={"join_code": game["join_code"], "display_name": "Twelfth"}
    )
    assert refused.status_code == 409
    assert refused.json()["error"] == "table_full"


def test_rejoining_while_seated_takes_no_second_seat(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    players = [make_registered(f"p{i}@test.local", f"P{i}") for i in range(10)]
    for p in players:
        _join(client, p, game["join_code"], 200)
    # a seated player joining again is a no-op — still 11 seated, not 12
    _join(client, players[0], game["join_code"], 200)
    g = client.get(f"/api/games/{game['id']}", headers=auth(host)).json()
    assert sum(1 for m in g["members"] if m["departed_at"] is None) == 11


def test_a_departed_seat_can_be_taken(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    players = [make_registered(f"p{i}@test.local", f"P{i}") for i in range(11)]
    for p in players[:10]:
        _join(client, p, game["join_code"], 200)
    # a settled player (no entries) may leave; that frees a seat
    left = client.post(f"/api/games/{game['id']}/leave", json={}, headers=auth(players[0]))
    assert left.status_code == 200, left.text
    _join(client, players[10], game["join_code"], 200)
    # and now the table is full again
    _join(client, make_registered("late@test.local", "Late"), game["join_code"], 409)
