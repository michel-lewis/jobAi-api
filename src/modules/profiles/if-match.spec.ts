import { BadRequestException } from '@nestjs/common';
import { formatETag, parseIfMatch } from './if-match.js';

describe('parseIfMatch', () => {
  it("rejette l'absence d'en-tête", () => {
    expect(() => parseIfMatch(undefined)).toThrow(BadRequestException);
  });

  it('lit un entier entre guillemets (forme ETag standard)', () => {
    expect(parseIfMatch('"3"')).toBe(3);
  });

  it('lit un entier nu', () => {
    expect(parseIfMatch('12')).toBe(12);
  });

  it('rejette une valeur qui n est pas un entier', () => {
    expect(() => parseIfMatch('pas-un-nombre')).toThrow(BadRequestException);
  });

  it('rejette une chaîne vide', () => {
    expect(() => parseIfMatch('')).toThrow(BadRequestException);
  });

  it('rejette un guillemet dépareillé', () => {
    expect(() => parseIfMatch('"5')).toThrow(BadRequestException);
    expect(() => parseIfMatch('5"')).toThrow(BadRequestException);
  });
});

describe('formatETag', () => {
  it('entoure la version de guillemets', () => {
    expect(formatETag(3)).toBe('"3"');
  });
});
