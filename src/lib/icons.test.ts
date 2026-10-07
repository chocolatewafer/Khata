import { describe, expect, it } from 'vitest';
import { glyphOn, iconKey, nearestPalette, PALETTE } from './icons';

describe('icons', () => {
  it('maps legacy emoji (with variation selectors) and keys', () => {
    expect(iconKey('\u{1f354}')).toBe('utensils');
    expect(iconKey('\u{1f6cd}\u{fe0f}')).toBe('shopping-bag');
    expect(iconKey('\u{2708}\u{fe0f}')).toBe('plane');
    expect(iconKey('coffee')).toBe('coffee');
    expect(iconKey('nonsense')).toBe('circle-ellipsis');
    expect(iconKey(undefined)).toBe('circle-ellipsis');
  });
  it('snaps colours to the identity palette', () => {
    expect(nearestPalette('#898781')).toBe(PALETTE.gray);
    expect(nearestPalette('#2a78d6')).toBe(PALETTE.blue);
    expect(nearestPalette('#e34948')).toBe(PALETTE.red);
    expect(nearestPalette('bad')).toBe(PALETTE.gray);
  });
  it('picks a readable glyph colour', () => {
    expect(glyphOn(PALETTE.yellow)).toBe('#1c1c1e');
    expect(glyphOn(PALETTE.blue)).toBe('#ffffff');
    expect(glyphOn(PALETTE.green)).toBe('#ffffff');
  });
});
