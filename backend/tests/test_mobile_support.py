"""Backend support the mobile client depends on: idempotent entry replay
for the offline queue, and push-token registration."""

import uuid

from sqlalchemy import text

from tests.helpers import auth, create_game, log_entry, to_running


def test_same_client_key_replay_returns_the_original_entry(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    key = str(uuid.uuid4())

    body = {"entry_type": "buy_in", "amount_minor": 2000, "client_key": key}
    first = client.post(f"/api/games/{game['id']}/entries", json=body, headers=auth(host))
    assert first.status_code == 201
    replay = client.post(f"/api/games/{game['id']}/entries", json=body, headers=auth(host))
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]

    g = client.get(f"/api/games/{game['id']}", headers=auth(host)).json()
    assert len(g["entries"]) == 1  # the flaky reconnect did not double-log


def test_different_client_keys_log_separate_entries(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    for _ in range(2):
        body = {"entry_type": "rebuy", "amount_minor": 2000, "client_key": str(uuid.uuid4())}
        assert (
            client.post(
                f"/api/games/{game['id']}/entries", json=body, headers=auth(host)
            ).status_code
            == 201
        )
    g = client.get(f"/api/games/{game['id']}", headers=auth(host)).json()
    assert len(g["entries"]) == 2


def test_entries_without_client_key_never_collide(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    log_entry(client, host, game["id"], "buy_in", 2000)
    log_entry(client, host, game["id"], "rebuy", 2000)
    g = client.get(f"/api/games/{game['id']}", headers=auth(host)).json()
    assert len(g["entries"]) == 2


def test_push_token_registration_upserts(client, make_registered, engine):
    user = make_registered("host@test.local", "Host")
    for _ in range(2):
        resp = client.post(
            "/api/users/me/push-token",
            json={"token": "ExponentPushToken[test-abc]"},
            headers=auth(user),
        )
        assert resp.status_code == 204
    with engine.begin() as conn:
        count = conn.execute(
            text("select count(*) from public.push_tokens where user_id = :u"),
            {"u": str(user["user_id"])},
        ).scalar_one()
    assert count == 1


def test_entry_out_echoes_the_client_key(client, make_registered):
    # the web client keys its optimistic row on this; without the echo the
    # real row would arrive under a different key and the list would flicker
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    key = str(uuid.uuid4())
    body = {"entry_type": "buy_in", "amount_minor": 2000, "client_key": key}
    created = client.post(f"/api/games/{game['id']}/entries", json=body, headers=auth(host))
    assert created.json()["client_key"] == key
    g = client.get(f"/api/games/{game['id']}", headers=auth(host)).json()
    assert g["entries"][0]["client_key"] == key


def test_amend_accepts_and_replays_a_client_key(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    entry = log_entry(client, host, game["id"], "buy_in", 2000)
    rejected = client.post(
        f"/api/entries/{entry['id']}/reject", json={}, headers=auth(host)
    ).json()
    key = str(uuid.uuid4())
    body = {"amount_minor": 4000, "if_version": rejected["version"], "client_key": key}
    first = client.post(f"/api/entries/{entry['id']}/amend", json=body, headers=auth(host))
    assert first.status_code == 201, first.text
    assert first.json()["client_key"] == key
    replay = client.post(f"/api/entries/{entry['id']}/amend", json=body, headers=auth(host))
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]
    g = client.get(f"/api/games/{game['id']}", headers=auth(host)).json()
    assert len(g["entries"]) == 2  # original + one amendment, not two
