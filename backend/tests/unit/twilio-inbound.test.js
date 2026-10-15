'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyCommand, normalizePhone, buildTwiML } = require('../../src/services/twilioInboundService');

test('inbound SMS commands are classified explicitly and case-insensitively', () => {
  assert.equal(classifyCommand(' stop '), 'STOP');
  assert.equal(classifyCommand('Stop All'), 'STOP');
  assert.equal(classifyCommand('unsubscribe'), 'STOP');
  assert.equal(classifyCommand(' START '), 'START');
  assert.equal(classifyCommand('yes'), 'START');
  assert.equal(classifyCommand('HELP'), 'HELP');
  assert.equal(classifyCommand('please help me'), 'UNKNOWN');
});

test('inbound phone normalisation accepts only E.164 numbers', () => {
  assert.equal(normalizePhone('+27821234567'), '+27821234567');
  assert.equal(normalizePhone('0821234567'), null);
  assert.equal(normalizePhone('+0123'), null);
});

test('Twilio XML responses escape user-controlled characters', () => {
  const xml = buildTwiML('A&B <message> "quoted"');
  assert.match(xml, /A&amp;B &lt;message&gt; &quot;quoted&quot;/);
  assert.match(xml, /^<\?xml version="1\.0"/);
});
