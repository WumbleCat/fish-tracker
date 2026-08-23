"""Verification races: if_version mismatches return 409 with the current row."""

from tests.helpers import auth, create_game, log_entry, to_running


def _pending_entry(client, make_registered):
    host = make_registered("host@test.local", "Host")
    player = make_registered("player@test.local", "Player")
    game = to_running(client, host, create_game(client, host))
    client.post("/api/games/join", json={"join_code": game["join_code"]}, headers=auth(player))
    entry = log_entry(client, player, game["id"], "buy_in", 4000)
    return host, player, game, entry


def test_stale_verify_after_reject_conflicts(client, make_registered):
    host, player, game, entry = _pending_entry(client, make_registered)
    client.post(
        f"/api/entries/{entry['id']}/reject",
        json={"if_version": entry["version"]},
        headers=auth(host),
    )
    # a second device still holding version 1 tries to verify
    resp = client.post(
        f"/api/entries/{entry['id']}/verify",
        json={"if_version": entry["version"]},
        headers=auth(host),
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["error"] == "version_conflict"
    # the current row rides along so the client can refetch-free retry
    assert body["detail"]["current"]["version"] == entry["version"] + 1
    assert body["detail"]["current"]["state"] == "rejected"


def test_concurrent_verify_and_amend_one_loses(client, make_registered):
    host, player, game, entry = _pending_entry(client, make_registered)
    rejected = client.post(
        f"/api/entries/{entry['id']}/reject",
        json={"if_version": entry["version"]},
        headers=auth(host),
    ).json()

    # host re-verifies (the rejection was a mistake) while the player amends:
    # whichever lands second with the stale version gets the conflict
    verified = client.post(
        f"/api/entries/{entry['id']}/verify",
        json={"if_version": rejected["version"]},
        headers=auth(host),
    )
    assert verified.status_code == 200

    resp = client.post(
        f"/api/entries/{entry['id']}/amend",
        json={"amount_minor": 2000, "if_version": rejected["version"]},
        headers=auth(player),
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "version_conflict"


def test_game_state_change_with_stale_version_conflicts(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = create_game(client, host)
    resp = client.post(
        f"/api/games/{game['id']}/state",
        json={"to": "open", "if_version": game["version"]},
        headers=auth(host),
    )
    assert resp.status_code == 200
    # a stale tab repeats the transition with the old version
    resp = client.post(
        f"/api/games/{game['id']}/state",
        json={"to": "open", "if_version": game["version"]},
        headers=auth(host),
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "version_conflict"
