import { createOfferSchema, type CreateOfferDto } from './create-offer.dto.js';

/**
 * Le plus petit document valide pour POST /offers. Les tests qui veulent un
 * cas invalide partent de celui-ci et ne cassent qu'un seul champ — pas de
 * fixture partagée créée pour ce module, ce squelette reste local au fichier.
 */
function makeValidInput(): Record<string, unknown> {
  return {
    title: 'Ingénieur backend',
    description: 'Nous cherchons une personne pour renforcer notre équipe.',
    company: 'Acme',
    location: 'Montréal',
    applyUrl: 'https://acme.example.com/jobs/42',
  };
}

describe('createOfferSchema', () => {
  it('accepte le document minimal valide', () => {
    const result = createOfferSchema.safeParse(makeValidInput());

    expect(result.success).toBe(true);
  });

  it('rejette un titre vide', () => {
    const result = createOfferSchema.safeParse({
      ...makeValidInput(),
      title: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejette une description de plus de 20 000 caractères', () => {
    const result = createOfferSchema.safeParse({
      ...makeValidInput(),
      description: 'x'.repeat(20_001),
    });

    expect(result.success).toBe(false);
  });

  it('accepte une description d exactement 20 000 caractères', () => {
    const result = createOfferSchema.safeParse({
      ...makeValidInput(),
      description: 'x'.repeat(20_000),
    });

    expect(result.success).toBe(true);
  });

  it('rejette une applyUrl qui n est pas http(s)', () => {
    const result = createOfferSchema.safeParse({
      ...makeValidInput(),
      applyUrl: 'ftp://acme.example.com/jobs/42',
    });

    expect(result.success).toBe(false);
  });

  it('accepte une applyUrl absente (null)', () => {
    const result = createOfferSchema.safeParse({
      ...makeValidInput(),
      applyUrl: null,
    });

    expect(result.success).toBe(true);
  });

  /**
   * Preuve 12 — côté exécution : même si le client glisse ces trois champs
   * dans le corps de la requête, le document validé ne doit jamais les
   * porter. Un schéma Zod `z.object` sans `.passthrough()` les retire déjà
   * par construction ; ce test tombe si quelqu'un ajoute `.passthrough()`
   * ou déclare ces clés dans le schéma.
   */
  it('ignore source, createdByUserId et applyChannel même envoyés par le client', () => {
    const parsed = createOfferSchema.parse({
      ...makeValidInput(),
      source: 'jobbank',
      createdByUserId: '11111111-1111-1111-1111-111111111111',
      applyChannel: 'generic_llm',
    });

    expect(parsed).not.toHaveProperty('source');
    expect(parsed).not.toHaveProperty('createdByUserId');
    expect(parsed).not.toHaveProperty('applyChannel');
  });

  /**
   * Preuve 12 — côté type : ce bloc ne s'exécute jamais (vérifié par
   * `npm run typecheck`, pas par vitest). `// @ts-expect-error` n'est
   * accepté par le compilateur QUE si l'accès qui suit est réellement une
   * erreur de type. Si `CreateOfferDto` gagnait un jour un champ `source`,
   * `createdByUserId` ou `applyChannel`, cette ligne cesserait d'être une
   * erreur et `tsc --noEmit` échouerait sur « unused @ts-expect-error ».
   */
  it('le type CreateOfferDto n a pas de propriété source, createdByUserId ni applyChannel', () => {
    const dto: CreateOfferDto = {
      title: 'x',
      description: 'y',
      company: null,
      location: null,
      applyUrl: null,
    };

    // @ts-expect-error — source n'existe pas sur CreateOfferDto
    void dto.source;
    // @ts-expect-error — createdByUserId n'existe pas sur CreateOfferDto
    void dto.createdByUserId;
    // @ts-expect-error — applyChannel n'existe pas sur CreateOfferDto
    void dto.applyChannel;

    expect(dto.title).toBe('x');
  });
});
