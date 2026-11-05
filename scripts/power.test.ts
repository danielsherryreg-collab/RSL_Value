import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parsePower,normalizePower} from '../shared/power.js';
test('power formats produce the same million value',()=>{
  for(const value of ['1.3','1,3','1.3 млн','1,3 млн','1300000','1 300 000',1300000]) assert.equal(parsePower(value),1.3);
});
test('power normalization is stable for stored values and small accounts',()=>{
  for(const value of [0,0.5,1.3,19,100,999,1300000,1900000,250000]) assert.equal(normalizePower(normalizePower(value)),normalizePower(value));
  assert.equal(normalizePower(1900000),1.9);
  assert.equal(normalizePower(250000),0.25);
});
test('invalid power is rejected instead of becoming NaN',()=>{
  for(const value of ['-1','hello','1,2,3','Infinity']) assert.equal(parsePower(value),undefined);
  assert.equal(parsePower(''),0);
});
