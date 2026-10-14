import { expect, it } from 'vitest';
import { webAccessibilityState } from './webAccessibilityState';

it('exposes native button states to web assistive technology, including false and mixed', () => {
  expect(webAccessibilityState({busy:true,checked:'mixed',disabled:false,expanded:false,selected:true})).toEqual({
    'aria-busy':true,'aria-checked':'mixed','aria-disabled':false,'aria-expanded':false,'aria-selected':true,
  });
});
