import { expect, it } from 'vitest';
import { COLORS, contrast, palette } from './theme';

it.each(COLORS.flatMap(c => [[c.name, c.hex, false], [c.name, c.hex, true]] as [string, string, boolean][]))('%s %s dark=%s stays readable', (_, hex, dark) => {
  const p = palette(hex, dark);
  expect(contrast(p.deep, p.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(p.deep, p.soft)).toBeGreaterThanOrEqual(4.5);   // accent text on tinted buttons and callouts
  expect(contrast(p.on, p.accent)).toBeGreaterThanOrEqual(4.5);   // text on filled buttons
  expect(contrast(p.on, p.price2)).toBeGreaterThanOrEqual(3);
});
