import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEmailBody } from '../gmail-helpers.js';

test('defaults to text/plain when body_type is undefined', () => {
  const out = renderEmailBody('hello\nworld', undefined);
  assert.equal(out.contentType, 'text/plain');
  assert.equal(out.body, 'hello\nworld');
});

test('treats explicit plain as text/plain passthrough', () => {
  const out = renderEmailBody('hello\nworld', 'plain');
  assert.equal(out.contentType, 'text/plain');
  assert.equal(out.body, 'hello\nworld');
});

test('treats unknown body_type as plain (no surprise behavior change)', () => {
  const out = renderEmailBody('hello', 'rtf' as any);
  assert.equal(out.contentType, 'text/plain');
  assert.equal(out.body, 'hello');
});

test('passes html through verbatim as text/html', () => {
  const input = '<p>hi <strong>there</strong></p>';
  const out = renderEmailBody(input, 'html');
  assert.equal(out.contentType, 'text/html');
  assert.equal(out.body, input);
});

test('renders markdown to html', () => {
  const out = renderEmailBody('# Title\n\nhello **world**', 'markdown');
  assert.equal(out.contentType, 'text/html');
  assert.match(out.body, /<h1[^>]*>Title<\/h1>/);
  assert.match(out.body, /<strong>world<\/strong>/);
});

test('markdown returns string body (not a Promise)', () => {
  const out = renderEmailBody('hello', 'markdown');
  assert.equal(typeof out.body, 'string');
});
