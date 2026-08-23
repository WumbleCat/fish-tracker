"""services/settlement.py is pure: nets in, payments out, no database."""

import uuid

import pytest

from app.services.settlement import Payment, SettlementDerivationError, settle

A, B, C, D = (uuid.UUID(int=i) for i in range(1, 5))


def test_two_player_game_is_one_payment():
    payments = settle({A: -6000, B: 6000})
    assert payments == [Payment(from_user=A, to_user=B, amount_minor=6000)]


def test_greedy_matches_largest_against_largest():
    payments = settle({A: -10000, B: -2000, C: 9000, D: 3000})
    assert sum(p.amount_minor for p in payments) == 12000
    # every debtor pays exactly their debt, every creditor receives theirs
    paid = {}
    received = {}
    for p in payments:
        paid[p.from_user] = paid.get(p.from_user, 0) + p.amount_minor
        received[p.to_user] = received.get(p.to_user, 0) + p.amount_minor
    assert paid == {A: 10000, B: 2000}
    assert received == {C: 9000, D: 3000}


def test_zero_nets_produce_no_payments():
    assert settle({A: 0, B: 0}) == []
    assert settle({}) == []


def test_nonzero_sum_raises_rather_than_papering_over():
    with pytest.raises(SettlementDerivationError):
        settle({A: -100, B: 99})


def test_acknowledged_discrepancy_is_the_unmatched_remainder():
    # 100 minor units of chips went missing: buy-ins 300, cash-outs 200.
    payments = settle({A: -300, B: 200}, discrepancy_minor=100)
    assert payments == [Payment(from_user=A, to_user=B, amount_minor=200)]
    # A paid 200 of a 300 debt; the remaining 100 is exactly the discrepancy.


def test_discrepancy_must_still_reconcile():
    with pytest.raises(SettlementDerivationError):
        settle({A: -300, B: 200}, discrepancy_minor=50)


def test_amounts_stay_integers_at_any_size():
    big = 10**14  # far beyond any home game, comfortably inside BIGINT
    payments = settle({A: -big, B: big})
    assert payments[0].amount_minor == big
    assert isinstance(payments[0].amount_minor, int)
