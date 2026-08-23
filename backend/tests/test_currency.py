"""Per-game currency: immutable once entries exist, exponent read from the
game, never a hard-coded 2."""

from tests.helpers import auth, create_game, get_game, log_entry, logged_verified, to_running


def test_currency_changes_freely_before_any_entry(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = create_game(client, host)
    resp = client.patch(
        f"/api/games/{game['id']}/currency", json={"currency": "EUR"}, headers=auth(host)
    )
    assert resp.status_code == 200
    assert resp.json()["currency"] == "EUR"
    assert resp.json()["currency_exponent"] == 2


def test_currency_locked_once_an_entry_exists(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    log_entry(client, host, game["id"], "buy_in", 1000)
    resp = client.patch(
        f"/api/games/{game['id']}/currency", json={"currency": "EUR"}, headers=auth(host)
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "currency_locked"


def test_currency_lock_is_database_enforced_too(client, make_registered, engine):
    from sqlalchemy import text

    host = make_registered("host@test.local", "Host")
    game = to_running(client, host, create_game(client, host))
    log_entry(client, host, game["id"], "buy_in", 1000)
    with engine.begin() as conn:
        try:
            conn.execute(
                text("update public.games set currency = 'EUR' where id = :g"),
                {"g": game["id"]},
            )
            assert False, "currency must be trigger-locked once entries exist"
        except Exception as e:
            assert "currency_locked" in str(e)


def test_jpy_exponent_zero_round_trips(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = create_game(client, host, currency="JPY")
    assert game["currency_exponent"] == 0
    game = to_running(client, host, game)
    logged_verified(client, host, host, game["id"], "buy_in", 5000)
    logged_verified(client, host, host, game["id"], "cash_out", 5000)

    g = get_game(client, host, game["id"])
    assert g["currency"] == "JPY"
    assert g["totals"]["verified_buy_ins_minor"] == 5000
    assert g["totals"]["verified_cash_outs_minor"] == 5000
    # 5000 minor units of JPY is ¥5000 exactly — the exponent is data, not code


def test_explicit_exponent_wins_over_metadata(client, make_registered):
    host = make_registered("host@test.local", "Host")
    game = create_game(client, host, currency="XTS", currency_exponent=3)
    assert game["currency_exponent"] == 3
