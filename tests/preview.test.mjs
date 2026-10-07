import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('hosted preview remains static, synthetic and non-executable',async()=>{
  const html=await readFile(new URL('../public/preview.html',import.meta.url),'utf8');
  assert.match(html,/STATIC SYNTHETIC SNAPSHOT/);
  assert.match(html,/NOT MARKET DATA/);
  assert.match(html,/NO EXECUTION/);
  assert.doesNotMatch(html,/<script\b/i);
  assert.doesNotMatch(html,/AAPL|MSFT|NVDA|TSLA|SPY|QQQ/);
  assert.doesNotMatch(html,/MASSIVE_API_KEY|OPENAI_API_KEY|broker(age)?\s*(api|key)/i);
});
