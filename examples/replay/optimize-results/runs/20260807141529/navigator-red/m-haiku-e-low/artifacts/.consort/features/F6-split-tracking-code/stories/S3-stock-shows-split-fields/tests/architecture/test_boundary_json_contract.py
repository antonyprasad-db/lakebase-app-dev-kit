"""
Fitness test for boundary (app/routes) contract compliance.
Verifies that the stock endpoint returns JSON only with split fields (NFR-F6-9).
"""
import json
import pytest
from unittest.mock import Mock, patch
from app.routes import stock_routes  # Example import, adjust to actual route module


class TestBoundaryJsonContract:
    """Verify boundary returns JSON only with split batch_number and serial_number fields."""

    def test_stock_endpoint_returns_json_with_split_fields(self, client):
        """T21: The boundary returns stock record as JSON with batch_number and serial_number."""
        # Mock a stock record response
        mock_stock = {
            "id": "stock-1",
            "sku": "test-sku",
            "location": "test-location",
            "batch_number": "B7",
            "serial_number": "S001",
            "quantity": 10,
        }

        with patch('app.services.stock_service.get_stock_record', return_value=mock_stock):
            response = client.get('/api/stock/stock-1')

            # Should return 200 OK
            assert response.status_code == 200

            # Should return JSON, not HTML
            assert response.headers['Content-Type'] == 'application/json'

            # Should have split fields
            data = response.get_json()
            assert 'batch_number' in data
            assert 'serial_number' in data
            assert data['batch_number'] == 'B7'
            assert data['serial_number'] == 'S001'

    def test_stock_endpoint_does_not_return_combined_inventory_code(self, client):
        """T21: The boundary does not return combined inventory_code in JSON response."""
        mock_stock = {
            "id": "stock-1",
            "sku": "test-sku",
            "location": "test-location",
            "batch_number": "B7",
            "serial_number": "S001",
            "quantity": 10,
        }

        with patch('app.services.stock_service.get_stock_record', return_value=mock_stock):
            response = client.get('/api/stock/stock-1')

            # Should not return combined inventory_code
            data = response.get_json()
            assert 'inventory_code' not in data

    def test_stock_endpoint_serializes_null_fields_as_json_null(self, client):
        """T21: NULL batch_number and serial_number are serialized as JSON null."""
        mock_stock = {
            "id": "stock-1",
            "sku": "test-sku",
            "location": "test-location",
            "batch_number": None,
            "serial_number": None,
            "quantity": 10,
        }

        with patch('app.services.stock_service.get_stock_record', return_value=mock_stock):
            response = client.get('/api/stock/stock-1')

            data = response.get_json()
            assert data['batch_number'] is None
            assert data['serial_number'] is None

    def test_stock_list_endpoint_returns_json_array_with_split_fields(self, client):
        """T21: List endpoint also returns split fields in JSON array."""
        mock_stocks = [
            {
                "id": "stock-1",
                "sku": "test-sku-1",
                "location": "test-location-1",
                "batch_number": "B7",
                "serial_number": "S001",
                "quantity": 10,
            },
            {
                "id": "stock-2",
                "sku": "test-sku-2",
                "location": "test-location-2",
                "batch_number": None,
                "serial_number": None,
                "quantity": 5,
            },
        ]

        with patch('app.services.stock_service.list_stock_records', return_value=mock_stocks):
            response = client.get('/api/stock')

            assert response.status_code == 200
            assert response.headers['Content-Type'] == 'application/json'

            data = response.get_json()
            assert isinstance(data, list)
            assert len(data) == 2

            # Both records should have split fields
            for record in data:
                assert 'batch_number' in record
                assert 'serial_number' in record
                assert 'inventory_code' not in record

    def test_boundary_does_not_render_html(self, client):
        """T21: The boundary never renders server-side HTML, only JSON."""
        # Attempt to get HTML content-type should not occur
        response = client.get('/api/stock/stock-1')

        # Should NOT be text/html
        assert response.headers['Content-Type'] != 'text/html'
        assert 'text/html' not in response.headers.get('Content-Type', '')

        # Should be JSON
        assert 'application/json' in response.headers.get('Content-Type', '')


class TestBoundaryDoesNotTouchDatabase:
    """Verify that the boundary layer does not directly touch the DB session (layering)."""

    def test_routes_do_not_query_database_directly(self):
        """T2: Routes should not contain db.query or session.execute calls."""
        # Read the routes module to verify no direct DB access
        import inspect
        import app.routes.stock_routes as stock_routes_module

        source = inspect.getsource(stock_routes_module)

        # Should not have direct DB queries in routes
        assert 'db.query(' not in source, "Routes contain direct db.query() calls"
        assert 'session.execute(' not in source, "Routes contain direct session.execute() calls"
        assert 'session.add(' not in source, "Routes contain direct session.add() calls"

        # Routes should delegate to services
        assert 'stock_service' in source or 'from app.services' in source, \
               "Routes should delegate to services"
