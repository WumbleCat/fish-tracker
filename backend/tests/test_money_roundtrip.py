"""Money is an integer count of minor units at every boundary. Floats are
refused outright; large values and many entries round-trip exactly."""

from tests.helpers import auth, create_game, get_game, log_entry, logged_verified, net_of, to_running


def test_float_amount_is_rejected_at_the_boundary(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    resp = client.post(
        f"/api/games/{game['id']}/entries",
        json={"entry_type": "buy_in", "amount_minor": 50.0},
        headers=auth(host),
    )
    assert resp.status_code == 422
    resp = client.post(
        f"/api/games/{game['id']}/entries",
        json={"entry_type": "buy_in", "amount_minor": 49.99},
        headers=auth(host),
    )
    assert resp.status_code == 422


def test_zero_and_negative_amounts_are_rejected(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    for bad in (0, -100):
        resp = client.post(
            f"/api/games/{game['id']}/entries",
            json={"entry_type": "buy_in", "amount_minor": bad},
            headers=auth(host),
        )
        assert resp.status_code == 422, f"{bad} should be refused"


def test_large_values_round_trip_exactly(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    big = 10**14 + 7  # would lose precision as a double's neighbourly float
    logged_verified(client, host, host, game["id"], "buy_in", big)
    g = get_game(client, host, game["id"])
    assert g["totals"]["verified_buy_ins_minor"] == big
    assert net_of(g, host["user_id"])["settleable_minor"] == -big


def test_many_entries_sum_exactly(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))

    amounts = [1, 3, 7, 99, 12345, 999999, 41, 5000, 250, 1]
    first, *rest = amounts
    logged_verified(client, player, host, game["id"], "buy_in", first)
    for a in rest:
        logged_verified(client, player, host, game["id"], "rebuy", a)

    g = get_game(client, host, game["id"])
    assert g["totals"]["verified_buy_ins_minor"] == sum(amounts)
    assert net_of(g, player["user_id"])["settleable_minor"] == -sum(amounts)
