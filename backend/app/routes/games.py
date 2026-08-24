import uuid

from fastapi import APIRouter
from sqlalchemy.orm import Session

from app.deps import CurrentPrincipal, DbSession
from app.models import Game
from app.schemas.entries import EntryCreate, EntryOut
from app.schemas.games import (
    CurrencyChangeRequest,
    GameCreate,
    GameOut,
    GameSummary,
    GameTotals,
    JoinRequest,
    MemberOut,
    PlayerNet,
    RemoveMemberRequest,
    StateChangeRequest,
    TransferHostRequest,
)
from app.schemas.settlement import CloseRequest, PaymentMarkRequest, SettlementOut
from app.schemas.users import PayoutDetailsMasked
from app.services import entries as entries_service
from app.services import games as games_service
from app.services import users as users_service

router = APIRouter(prefix="/api/games", tags=["games"])


def _game_out(session: Session, game: Game) -> GameOut:
    members = games_service.game_members_with_users(session, game.id)
    entries = games_service.game_entries(session, game.id)
    positions = games_service.compute_positions(entries)
    nets = [
        PlayerNet(
            user_id=m.user_id,
            settleable_minor=positions["settleable"].get(m.user_id, 0),
            pending_delta_minor=positions["pending_delta"].get(m.user_id, 0),
            pending_count=positions["pending_count"].get(m.user_id, 0),
        )
        for m, _ in members
    ]
    return GameOut(
        id=game.id,
        name=game.name,
        join_code=game.join_code,
        state=game.state,
        host_id=game.host_id,
        currency=game.currency,
        currency_exponent=game.currency_exponent,
        stake_minor=game.stake_minor,
        created_at=game.created_at,
        closed_at=game.closed_at,
        version=game.version,
        members=[
            MemberOut(
                user_id=m.user_id,
                display_name=u.display_name,
                is_guest=u.is_guest,
                role=m.role,
                joined_at=m.joined_at,
                departed_at=m.departed_at,
                departed_unsettled=m.departed_unsettled,
            )
            for m, u in members
        ],
        entries=[EntryOut.model_validate(e) for e in entries],
        nets=nets,
        totals=GameTotals(
            verified_buy_ins_minor=positions["verified_buy_ins"],
            verified_cash_outs_minor=positions["verified_cash_outs"],
            chips_on_table_minor=positions["chips_on_table"],
            pending_count=positions["total_pending"],
        ),
    )


@router.post("", response_model=GameOut, status_code=201)
def create_game(body: GameCreate, session: DbSession, principal: CurrentPrincipal):
    game = games_service.create_game(
        session, principal, body.name, body.currency, body.currency_exponent,
        body.stake_minor,
    )
    return _game_out(session, game)


@router.get("", response_model=list[GameSummary])
def list_games(session: DbSession, principal: CurrentPrincipal):
    return [
        GameSummary(
            id=g.id,
            name=g.name,
            state=g.state,
            currency=g.currency,
            currency_exponent=g.currency_exponent,
            created_at=g.created_at,
            closed_at=g.closed_at,
            role=m.role,
        )
        for g, m in games_service.list_my_games(session, principal)
    ]


@router.post("/join", response_model=GameOut)
def join_game(body: JoinRequest, session: DbSession, principal: CurrentPrincipal):
    game = games_service.join_game(session, principal, body.join_code)
    return _game_out(session, game)


@router.get("/{game_id}", response_model=GameOut)
def get_game(game_id: uuid.UUID, session: DbSession, principal: CurrentPrincipal):
    game = games_service.load_member_game(session, principal, game_id)
    return _game_out(session, game)


@router.post("/{game_id}/state", response_model=GameOut)
def change_state(
    game_id: uuid.UUID,
    body: StateChangeRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    game = games_service.change_state(
        session, principal, game_id, body.to, body.if_version
    )
    return _game_out(session, game)


@router.post("/{game_id}/transfer-host", response_model=GameOut)
def transfer_host(
    game_id: uuid.UUID,
    body: TransferHostRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    game = games_service.transfer_host(
        session, principal, game_id, body.user_id, body.if_version
    )
    return _game_out(session, game)


@router.post("/{game_id}/leave", response_model=GameOut)
def leave_game(game_id: uuid.UUID, session: DbSession, principal: CurrentPrincipal):
    games_service.leave_game(session, principal, game_id)
    game = session.get(Game, game_id)
    return _game_out(session, game)


@router.post("/{game_id}/members/{user_id}/remove", response_model=GameOut)
def remove_member(
    game_id: uuid.UUID,
    user_id: uuid.UUID,
    body: RemoveMemberRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    games_service.remove_member(session, principal, game_id, user_id)
    game = session.get(Game, game_id)
    return _game_out(session, game)


@router.patch("/{game_id}/currency", response_model=GameOut)
def change_currency(
    game_id: uuid.UUID,
    body: CurrencyChangeRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    game = games_service.change_currency(
        session, principal, game_id, body.currency, body.currency_exponent,
        body.if_version,
    )
    return _game_out(session, game)


@router.post("/{game_id}/entries", response_model=EntryOut, status_code=201)
def log_entry(
    game_id: uuid.UUID,
    body: EntryCreate,
    session: DbSession,
    principal: CurrentPrincipal,
):
    return entries_service.log_entry(
        session, principal, game_id, body.entry_type, body.amount_minor, body.user_id,
        body.client_key,
    )


@router.get("/{game_id}/settlement", response_model=SettlementOut)
def get_settlement(
    game_id: uuid.UUID, session: DbSession, principal: CurrentPrincipal
):
    return games_service.get_settlement_view(session, principal, game_id)


@router.post("/{game_id}/close", response_model=SettlementOut)
def close_game(
    game_id: uuid.UUID,
    body: CloseRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    games_service.close_game(
        session, principal, game_id, body.acknowledge_discrepancy, body.if_version
    )
    return games_service.get_settlement_view(session, principal, game_id)


@router.post("/{game_id}/payments/mark", response_model=SettlementOut)
def mark_payment(
    game_id: uuid.UUID,
    body: PaymentMarkRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    games_service.mark_payment(
        session, principal, game_id, body.from_user, body.to_user, body.paid
    )
    return games_service.get_settlement_view(session, principal, game_id)


@router.get("/{game_id}/payout-details", response_model=list[PayoutDetailsMasked])
def game_payout_details(
    game_id: uuid.UUID, session: DbSession, principal: CurrentPrincipal
):
    return users_service.game_payout_details(session, principal, game_id)
