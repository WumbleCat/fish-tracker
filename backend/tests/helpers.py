"""API-driven setup helpers. Everything goes through the endpoints, so tests
exercise the same enforcement path the clients hit."""


def auth(user) -> dict:
    token = user["token"] if isinstance(user, dict) else user
    return {"Authorization": f"Bearer {token}"}


def create_game(client, host, name="Friday game", currency="GBP", **kwargs):
    resp = client.post(
        "/api/games", json={"name": name, "currency": currency, **kwargs}, headers=auth(host)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def to_running(client, host, game):
    for state in ("open", "running"):
        resp = client.post(
            f"/api/games/{game['id']}/state", json={"to": state}, headers=auth(host)
        )
        assert resp.status_code == 200, resp.text
        game = resp.json()
    return game


def join(client, user, join_code):
    resp = client.post("/api/games/join", json={"join_code": join_code}, headers=auth(user))
    assert resp.status_code == 200, resp.text
    return resp.json()


def guest_join(client, join_code, display_name):
    resp = client.post(
        "/api/auth/guest", json={"join_code": join_code, "display_name": display_name}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def add_player(client, host, game_id, display_name, expect=201):
    resp = client.post(
        f"/api/games/{game_id}/members",
        json={"display_name": display_name},
        headers=auth(host),
    )
    assert resp.status_code == expect, resp.text
    return resp.json()


def log_entry(client, user, game_id, entry_type, amount_minor, target_user_id=None, expect=201):
    body = {"entry_type": entry_type, "amount_minor": amount_minor}
    if target_user_id:
        body["user_id"] = str(target_user_id)
    resp = client.post(f"/api/games/{game_id}/entries", json=body, headers=auth(user))
    assert resp.status_code == expect, resp.text
    return resp.json()


def verify(client, host, entry, expect=200):
    resp = client.post(
        f"/api/entries/{entry['id']}/verify",
        json={"if_version": entry["version"]},
        headers=auth(host),
    )
    assert resp.status_code == expect, resp.text
    return resp.json()


def logged_verified(client, user, host, game_id, entry_type, amount_minor, target_user_id=None):
    entry = log_entry(client, user, game_id, entry_type, amount_minor, target_user_id)
    return verify(client, host, entry)


def get_game(client, user, game_id):
    resp = client.get(f"/api/games/{game_id}", headers=auth(user))
    assert resp.status_code == 200, resp.text
    return resp.json()


def net_of(game_json, user_id) -> dict:
    return next(n for n in game_json["nets"] if n["user_id"] == str(user_id))
