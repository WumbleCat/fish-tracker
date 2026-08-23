"""Settlement: nets in, payments out. Pure — no database access.

Net convention: per player, verified cash-outs minus verified buy-ins, in
integer minor units. Positive means the table owes them; negative means they
pay. The game-level discrepancy is verified buy-ins minus verified cash-outs,
so a coherent input always satisfies sum(nets) + discrepancy == 0 — and when
the game balances, discrepancy is 0 and the nets sum to zero exactly.
"""

import uuid
from dataclasses import dataclass


class SettlementDerivationError(Exception):
    """The nets don't account for the game's money. This is a derivation bug
    upstream, never a rounding artefact — surface it, don't paper over it."""


@dataclass(frozen=True)
class Payment:
    from_user: uuid.UUID
    to_user: uuid.UUID
    amount_minor: int


def settle(
    nets: dict[uuid.UUID, int], *, discrepancy_minor: int = 0
) -> list[Payment]:
    """Greedy largest-debtor-to-largest-creditor matching.

    Not guaranteed minimal (that problem is NP-hard) but instant, and
    typically three or four payments for eight players. With an acknowledged
    discrepancy the unmatched remainder is exactly that discrepancy.
    """
    if sum(nets.values()) + discrepancy_minor != 0:
        raise SettlementDerivationError(
            f"nets sum to {sum(nets.values())} but discrepancy is "
            f"{discrepancy_minor}; expected sum(nets) + discrepancy == 0"
        )

    owed = sorted(
        ((u, n) for u, n in nets.items() if n > 0), key=lambda x: (-x[1], str(x[0]))
    )
    owes = sorted(
        ((u, -n) for u, n in nets.items() if n < 0), key=lambda x: (-x[1], str(x[0]))
    )

    payments: list[Payment] = []
    i, j = 0, 0
    while i < len(owes) and j < len(owed):
        (debtor, debt), (creditor, credit) = owes[i], owed[j]
        amount = min(debt, credit)
        payments.append(Payment(from_user=debtor, to_user=creditor, amount_minor=amount))
        owes[i] = (debtor, debt - amount)
        owed[j] = (creditor, credit - amount)
        if owes[i][1] == 0:
            i += 1
        if owed[j][1] == 0:
            j += 1
    return payments
