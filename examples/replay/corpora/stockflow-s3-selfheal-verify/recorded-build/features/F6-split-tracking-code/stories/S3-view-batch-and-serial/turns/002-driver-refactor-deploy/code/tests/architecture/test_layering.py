"""Layering fitness test (T4): the app/routes boundary must not import the DB
session or ORM models; persistence lives ONLY in the repository layer
(app/repositories/), per architecture.json's declared layers for
S1-file-stock-record. Static/structural check, no Gherkin.
"""

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ROUTES_DIR = REPO_ROOT / "app" / "routes"
REPOSITORIES_DIR = REPO_ROOT / "app" / "repositories"
SERVICES_DIR = REPO_ROOT / "app" / "services"

# Names that indicate direct DB/session/ORM access; these must never appear as
# an imported name inside the boundary module.
_FORBIDDEN_IMPORT_NAMES = {"Session", "SessionLocal", "db", "session"}


def _imported_names(py_file: Path) -> set[str]:
    tree = ast.parse(py_file.read_text(), filename=str(py_file))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add((alias.asname or alias.name).split(".")[-1])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                names.add(alias.asname or alias.name)
    return names


def _route_source_files() -> list[Path]:
    assert ROUTES_DIR.is_dir(), (
        f"{ROUTES_DIR} does not exist yet; the boundary layer must live at "
        "app/routes/ per architecture.json"
    )
    return [p for p in ROUTES_DIR.rglob("*.py") if p.name != "__init__.py"]


def test_boundary_does_not_import_db_session_or_orm():
    route_files = _route_source_files()
    assert route_files, f"no route modules found under {ROUTES_DIR}"
    for py_file in route_files:
        imported = _imported_names(py_file)
        offending = imported & _FORBIDDEN_IMPORT_NAMES
        assert not offending, (
            f"{py_file} imports {offending} directly; the boundary must "
            "delegate persistence to StockRepository, not touch the DB "
            "session/ORM itself"
        )


def test_repository_layer_exists():
    assert REPOSITORIES_DIR.is_dir(), (
        f"{REPOSITORIES_DIR} does not exist; persistence must live in a "
        "StockRepository under app/repositories/ per architecture.json"
    )
    repo_files = [p for p in REPOSITORIES_DIR.rglob("*.py") if p.name != "__init__.py"]
    assert repo_files, f"no repository modules found under {REPOSITORIES_DIR}"


def test_read_boundary_delegates_listing_to_repository():
    """T17 (S2-browse-stock-table, AC1-table-lists-filed-stock): the
    stock-table READ path must hold to the same layering contract as the
    write path , app/routes must not import the DB session/ORM directly, and
    the listing capability the home table needs must be exposed by
    StockRepository, not queried ad hoc inside the boundary. Read persistence
    lives only in the repository layer.
    """
    route_files = _route_source_files()
    for py_file in route_files:
        imported = _imported_names(py_file)
        offending = imported & _FORBIDDEN_IMPORT_NAMES
        assert not offending, (
            f"{py_file} imports {offending} directly; the stock-table read "
            "path must delegate persistence to StockRepository, not touch "
            "the DB session/ORM itself"
        )

    repo_file = REPOSITORIES_DIR / "stock_repository.py"
    assert repo_file.is_file(), (
        f"{repo_file} must exist; read persistence for the stock table "
        "lives only in StockRepository"
    )
    source = repo_file.read_text()
    assert "def list" in source, (
        f"{repo_file} must expose a list method (e.g. list_all/"
        "list_by_location) so the stock-table read boundary delegates "
        "listing persistence to StockRepository instead of querying inline"
    )


def test_detail_read_boundary_delegates_to_repository():
    """T23 (S3-inspect-sku-detail, AC1-detail-lists-sku-locations): the
    SKU-detail read boundary must hold to the same layering contract , the
    app/routes boundary must not import the DB session/ORM models directly,
    and the per-sku fan-out across locations the detail view needs must be
    exposed by StockRepository (e.g. a list_by_sku method), not queried ad
    hoc inside the boundary or the service. Read persistence for the detail
    path lives only in the repository layer.
    """
    route_files = _route_source_files()
    for py_file in route_files:
        imported = _imported_names(py_file)
        offending = imported & _FORBIDDEN_IMPORT_NAMES
        assert not offending, (
            f"{py_file} imports {offending} directly; the SKU-detail read "
            "path must delegate persistence to StockRepository, not touch "
            "the DB session/ORM itself"
        )

    repo_file = REPOSITORIES_DIR / "stock_repository.py"
    assert repo_file.is_file(), (
        f"{repo_file} must exist; read persistence for the SKU detail view "
        "lives only in StockRepository"
    )
    source = repo_file.read_text()
    assert "def list_by_sku" in source, (
        f"{repo_file} must expose a list_by_sku method so the SKU-detail "
        "read boundary delegates the per-sku, cross-location fan-out to "
        "StockRepository instead of querying inline"
    )


def test_split_backfill_logic_not_in_boundary_or_client():
    """T7 (S1-split-code-migration, AC1-conforming-code-splits-to-batch-and-serial):
    the code-segment parsing logic (hyphen-delimited segment splitting) that
    mirrors the split migration's parse/reconstruct rule must live in the
    migration layer only, never the api-boundary or the client. The boundary
    must hold to the same no-DB-session-import contract as the write/read
    paths. inventory_code is retired end-to-end by this AC, so the boundary
    and client use batch_number/serial_number directly as the contract
    fields; what must never appear there is inline "split('-', ...)"-style
    parsing/reconstruction logic.
    """
    route_files = _route_source_files()
    for py_file in route_files:
        imported = _imported_names(py_file)
        offending = imported & _FORBIDDEN_IMPORT_NAMES
        assert not offending, (
            f"{py_file} imports {offending} directly; the boundary must never "
            "touch the DB session/ORM, including the split migration's "
            "parsing/backfill logic"
        )
        source = py_file.read_text()
        assert "inventory_code" not in source, (
            f"{py_file} references inventory_code; the split-code migration "
            "retired that column, the boundary must use batch_number/"
            "serial_number instead"
        )
        assert "split(" not in source, (
            f"{py_file} contains inline code-segment parsing logic; that "
            "logic must live only in the migration layer, never the boundary"
        )

    client_src = REPO_ROOT / "client" / "src"
    if client_src.is_dir():
        for source_file in client_src.rglob("*.ts*"):
            source = source_file.read_text()
            assert "inventory_code" not in source, (
                f"{source_file} references inventory_code; the split-code "
                "migration retired that column, the client must use "
                "batch_number/serial_number instead"
            )


def test_detail_dto_batch_serial_mapping_lives_in_service_only():
    """T23 (S3-view-batch-and-serial, AC1-batch-shown-as-distinct-field): the
    detail DTO's batch_number/serial_number field mapping must live only in
    the stock-service (app/services/), reading from StockRepository
    (app/repositories/, the only ORM/session layer). The api-boundary
    (app/routes/) must delegate to the service for that mapping rather than
    reading record.batch_number/record.serial_number directly itself, and
    the client (client/) must consume the DTO's JSON fields only, with no
    model or ORM import.
    """
    route_files = _route_source_files()
    for py_file in route_files:
        imported = _imported_names(py_file)
        offending = imported & _FORBIDDEN_IMPORT_NAMES
        assert not offending, (
            f"{py_file} imports {offending} directly; the boundary must "
            "never touch the DB session/ORM"
        )
        source = py_file.read_text()
        for forbidden_attr in (".batch_number", ".serial_number"):
            assert forbidden_attr not in source, (
                f"{py_file} accesses {forbidden_attr} directly; the detail "
                "DTO's batch_number/serial_number mapping must live only in "
                "the stock-service (app/services/), not the api-boundary"
            )

    service_file = SERVICES_DIR / "stock_service.py"
    assert service_file.is_file(), f"{service_file} must exist"
    service_source = service_file.read_text()
    assert ".batch_number" in service_source and ".serial_number" in service_source, (
        f"{service_file} must contain the detail DTO's batch_number/"
        "serial_number field mapping, read from StockRepository"
    )

    client_src = REPO_ROOT / "client" / "src"
    if client_src.is_dir():
        for source_file in client_src.rglob("*.ts*"):
            source = source_file.read_text()
            assert "sqlalchemy" not in source and "app.models" not in source, (
                f"{source_file} must not import the ORM/model layer; the "
                "client consumes the detail DTO's JSON fields only"
            )


def test_integrity_probe_count_query_lives_in_repository_and_service_only():
    """T17 (S2-integrity-probe, AC1-reports-count-of-nonconforming-rows): the
    integrity-probe count query lives only in the repository layer
    (app/repositories/), exposed through a read-only service method
    (app/services/), with no write path added and no ORM/session import
    introduced in the api-boundary or client.
    """
    repo_file = REPOSITORIES_DIR / "stock_repository.py"
    assert repo_file.is_file(), f"{repo_file} must exist"
    repo_source = repo_file.read_text()
    repo_tree = ast.parse(repo_source, filename=str(repo_file))
    count_fn = next(
        (
            node
            for node in ast.walk(repo_tree)
            if isinstance(node, ast.FunctionDef) and "nonconforming" in node.name
        ),
        None,
    )
    assert count_fn is not None, (
        f"{repo_file} must expose a count-nonconforming query method (e.g. "
        "count_nonconforming) so the integrity-probe persistence lives only "
        "in the repository layer"
    )
    fn_source = ast.get_source_segment(repo_source, count_fn) or ""
    for forbidden in (".add(", ".commit(", ".delete(", ".update("):
        assert forbidden not in fn_source, (
            f"{repo_file}'s {count_fn.name} contains {forbidden!r}; the "
            "integrity probe must be read-only and add no write path"
        )

    service_file = SERVICES_DIR / "stock_service.py"
    assert service_file.is_file(), f"{service_file} must exist"
    service_source = service_file.read_text()
    service_tree = ast.parse(service_source, filename=str(service_file))
    probe_method = next(
        (
            node
            for node in ast.walk(service_tree)
            if isinstance(node, ast.FunctionDef) and "nonconforming" in node.name
        ),
        None,
    )
    assert probe_method is not None, (
        f"{service_file} must expose a read-only integrity-probe method that "
        "surfaces the repository's nonconforming count"
    )
    method_source = ast.get_source_segment(service_source, probe_method) or ""
    for forbidden in (".add(", ".commit(", ".delete(", ".update("):
        assert forbidden not in method_source, (
            f"{service_file}'s {probe_method.name} contains {forbidden!r}; "
            "the integrity probe must be read-only and add no write path"
        )

    route_files = _route_source_files()
    for py_file in route_files:
        imported = _imported_names(py_file)
        offending = imported & _FORBIDDEN_IMPORT_NAMES
        assert not offending, (
            f"{py_file} imports {offending} directly; the integrity probe "
            "must not introduce an ORM/session import in the api-boundary"
        )

    client_src = REPO_ROOT / "client" / "src"
    if client_src.is_dir():
        for source_file in client_src.rglob("*.ts*"):
            source = source_file.read_text()
            assert "SessionLocal" not in source and "sqlalchemy" not in source, (
                f"{source_file} must not import the ORM/session for the "
                "integrity probe"
            )
