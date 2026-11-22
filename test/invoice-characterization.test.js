'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');

var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

// Mirrors the in-memory order line shape produced by routes/orders.js.
// These tests deliberately do not read or write data/db.json.
function orderFor(price, coupon) {
  var items = [{
    id: 1,
    sku: 'RICE-1',
    name: 'Rice',
    hsn: '1006',
    price: price,
    qty: 1
  }];
  var totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 1234,
    date: '22/11/2026',
    customer: 'Test customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('pricing calculates GST from the HSN 1006 five-percent slab', function () {
  var order = orderFor(1000, '');
  var totals = pricing.computeTotals(order.items, '');

  assert.equal(totals.lines[0].gstPercent, 5);
  assert.equal(totals.tax, 50);
  assert.equal(totals.total, 1050);
});

test('invoice GST and total match the billed HSN-based order', function () {
  var order = orderFor(1000, '');
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[0].lineTax, 50);
  assert.equal(figures.tax, order.tax);
  assert.equal(figures.total, order.total);
});

test('invoice uses the same capped subtotal discount and post-discount GST as the billed order', function () {
  var order = orderFor(1000, 'SAVE10');
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(order.discount, 100);
  assert.equal(order.tax, 45);
  assert.equal(order.total, 945);
  assert.equal(figures.discount, order.discount);
  assert.equal(figures.tax, order.tax);
  assert.equal(figures.cgst, 22.5);
  assert.equal(figures.sgst, 22.5);
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[0].lineTax, 45);
  assert.equal(figures.total, order.total);
});

test('invoice honors coupon maximum discount and matches billed total', function () {
  var order = orderFor(3000, 'WELCOME');
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(order.discount, 100);
  assert.equal(order.tax, 145);
  assert.equal(order.total, 3045);
  assert.equal(figures.discount, order.discount);
  assert.equal(figures.tax, order.tax);
  assert.equal(figures.total, order.total);
});

test('GST reconciliation reports matching figures for an invoice and its billed order', function () {
  var order = orderFor(1000, 'SAVE10');
  var result = reports.getGstReconciliation({ orders: [order] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].ledgerTax, 45);
  assert.equal(result.rows[0].invoiceTax, 45);
  assert.equal(result.rows[0].ledgerTotal, 945);
  assert.equal(result.rows[0].invoiceTotal, 945);
  assert.equal(result.rows[0].matched, true);
});
