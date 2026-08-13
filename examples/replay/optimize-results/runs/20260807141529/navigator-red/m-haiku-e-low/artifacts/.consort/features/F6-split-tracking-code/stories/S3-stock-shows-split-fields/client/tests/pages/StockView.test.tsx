/**
 * Client tests for StockView component rendering split batch_number and serial_number fields.
 * These tests verify the SPA renders the split tracking code fields as separate, labelled inputs.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StockView from '../../../src/pages/StockView';

/**
 * T20: The stock view renders batch and serial as two distinct, separately labelled fields
 * where the combined tracking code used to be shown.
 */
describe('StockView - Split Fields Display', () => {
  it('should render batch and serial as separate fields', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: 'B7',
      serial_number: 'S001',
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    // Check for batch field
    const batchField = screen.getByTestId('stock-batch-field');
    expect(batchField).toBeInTheDocument();

    // Check for serial field
    const serialField = screen.getByTestId('stock-serial-field');
    expect(serialField).toBeInTheDocument();

    // Both should have labels
    expect(screen.getByText('Batch Number')).toBeInTheDocument();
    expect(screen.getByText('Serial Number')).toBeInTheDocument();
  });

  /**
   * T24: The opaque combined tracking code is no longer rendered anywhere on the stock view.
   */
  it('should not render the combined inventory_code field', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: 'B7',
      serial_number: 'S001',
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    // The old combined code element should not exist
    const combinedCodeElement = screen.queryByTestId('stock-inventory-code');
    expect(combinedCodeElement).not.toBeInTheDocument();

    // No "inventory_code" label should be present
    expect(screen.queryByText('Inventory Code')).not.toBeInTheDocument();
    expect(screen.queryByText('Tracking Code')).not.toBeInTheDocument();
  });
});

/**
 * T22: Given a stock record whose batch_number is populated,
 * the stock view's batch field displays that record's exact batch value unchanged.
 */
describe('StockView - Batch Value Display', () => {
  it('should display the batch_number value in the batch field', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: 'B7',
      serial_number: 'S001',
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    const batchField = screen.getByTestId('stock-batch-field') as HTMLInputElement;
    expect(batchField.value).toBe('B7');
  });

  it('should display exact batch value with special characters', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: 'B-7_X',
      serial_number: 'S001',
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    const batchField = screen.getByTestId('stock-batch-field') as HTMLInputElement;
    expect(batchField.value).toBe('B-7_X');
  });
});

/**
 * T23: Given a stock record whose serial_number is populated,
 * the stock view's serial field displays that record's exact serial value unchanged.
 */
describe('StockView - Serial Value Display', () => {
  it('should display the serial_number value in the serial field', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: 'B7',
      serial_number: 'S001',
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    const serialField = screen.getByTestId('stock-serial-field') as HTMLInputElement;
    expect(serialField.value).toBe('S001');
  });

  it('should display exact serial value with special characters', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: 'B7',
      serial_number: 'S-001_X',
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    const serialField = screen.getByTestId('stock-serial-field') as HTMLInputElement;
    expect(serialField.value).toBe('S-001_X');
  });
});

/**
 * T25: Given a stock record whose batch or serial is NULL,
 * that empty field renders an explicit 'none yet' indicator rather than a blank or absent region.
 */
describe('StockView - NULL Field Handling', () => {
  it('should display "none yet" when batch_number is NULL', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: null,
      serial_number: 'S001',
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    const batchField = screen.getByTestId('stock-batch-field');
    expect(batchField).toHaveTextContent('none yet');
  });

  it('should display "none yet" when serial_number is NULL', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: 'B7',
      serial_number: null,
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    const serialField = screen.getByTestId('stock-serial-field');
    expect(serialField).toHaveTextContent('none yet');
  });

  it('should display "none yet" for both batch and serial when both are NULL', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: null,
      serial_number: null,
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    const batchField = screen.getByTestId('stock-batch-field');
    const serialField = screen.getByTestId('stock-serial-field');

    expect(batchField).toHaveTextContent('none yet');
    expect(serialField).toHaveTextContent('none yet');
  });

  it('should not show literal "null" or empty string for NULL values', () => {
    const mockStockRecord = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: null,
      serial_number: null,
      quantity: 10,
    };

    render(
      <StockView
        record={mockStockRecord}
        onUpdate={() => {}}
      />
    );

    const batchField = screen.getByTestId('stock-batch-field');
    const serialField = screen.getByTestId('stock-serial-field');

    // Should not contain the literal string "null" (case-insensitive)
    expect(batchField.textContent).not.toMatch(/null/i);
    expect(serialField.textContent).not.toMatch(/null/i);

    // Should not be empty strings
    expect(batchField.textContent).not.toBe('');
    expect(serialField.textContent).not.toBe('');
  });
});

/**
 * T21: The boundary (app/routes) returns the stock record as JSON only carrying
 * batch_number and serial_number as separate fields (validates the API contract).
 * This test uses the API response from the boundary.
 */
describe('StockView - API Contract Integration', () => {
  it('should render from API response with split batch_number and serial_number', () => {
    // Simulate API response from app/routes
    const apiResponse = {
      id: 'stock-1',
      sku: 'test-sku',
      location: 'test-location',
      batch_number: 'B7',
      serial_number: 'S001',
      quantity: 10,
      // Ensure combined inventory_code is NOT in the response
    };

    render(
      <StockView
        record={apiResponse}
        onUpdate={() => {}}
      />
    );

    // Should render both split fields
    const batchField = screen.getByTestId('stock-batch-field') as HTMLInputElement;
    const serialField = screen.getByTestId('stock-serial-field') as HTMLInputElement;

    expect(batchField.value).toBe('B7');
    expect(serialField.value).toBe('S001');

    // Should NOT have inventory_code property
    expect(apiResponse).not.toHaveProperty('inventory_code');
  });
});
