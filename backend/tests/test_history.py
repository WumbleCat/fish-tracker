"""A signed-in player's history: every table they sat at, whether they hosted
it, and their own buy-ins and cash-outs — money from verified entries only."""

from tests.helpers import auth, create_game, log_entry, to_running, verify


def test_games_history_lists_tables_hosted_and_played_with_own_entries(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("p@test.local", "Pat")
    game = to_running(client, host, create_game(client, host, name="Friday"))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))

    buy = log_entry(client, player, game["id"], "buy_in", 2000)
    verify(client, host, buy)
    log_entry(client, player, game["id"], "rebuy", 1000)  # stays pending
    host_buy = log_entry(client, host, game["id"], "buy_in", 5000)
    verify(client, host, host_buy)

    mine = client.get("/api/users/me/games", headers=auth(player)).json()["games"]
    assert [g["name"] for g in mine] == ["Friday"]
    row = mine[0]
    assert row["hosted"] is False and row["role"] == "player"
    # verified buy-in counts; the pending rebuy is listed but not summed
    assert row["buy_ins_minor"] == 2000
    assert row["net_minor"] == -2000
    assert [(e["entry_type"], e["state"]) for e in row["entries"]] == [
        ("buy_in", "verified"),
        ("rebuy", "pending"),
    ]

    hosted = client.get("/api/users/me/games", headers=auth(host)).json()["games"]
    assert hosted[0]["hosted"] is True and hosted[0]["role"] == "host"
    assert hosted[0]["buy_ins_minor"] == 5000
    # only the host's own entries appear in the host's history
    assert len(hosted[0]["entries"]) == 1


def test_guest_gets_no_history(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    guest = client.post(
        "/api/auth/guest", json={"join_code": game["join_code"], "display_name": "G"}
    ).json()
    resp = client.get("/api/users/me/games", headers=auth(guest["token"]))
    assert resp.status_code == 403
