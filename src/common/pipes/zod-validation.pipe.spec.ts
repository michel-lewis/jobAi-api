import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/**
 * BUG C — le `as` qui faisait taire le compilateur.
 *
 * Ce pipe lisait `result.error.errors`, qui n'existe pas en Zod 4 (c'est
 * `.issues`). Un `as ZodError` avait éteint le vérificateur de types, donc
 * rien ne prévenait à la compilation, et `.map` plantait à l'exécution.
 *
 * Un test unitaire voit ce bug parce qu'il EXÉCUTE le chemin d'erreur. Le
 * compilateur, lui, avait reçu l'ordre de se taire.
 */
describe('ZodValidationPipe', () => {
  const schema = z.object({
    email: z.email(),
    age: z.coerce.number().min(18),
  });
  const pipe = new ZodValidationPipe(schema);

  it('laisse passer une valeur valide, transformée', () => {
    // La coercition fait partie du contrat : '30' entre, 30 sort.
    expect(pipe.transform({ email: 'lewis@example.com', age: '30' })).toEqual({
      email: 'lewis@example.com',
      age: 30,
    });
  });

  it('rejette une valeur invalide avec le format d erreur de l API', () => {
    const error = (() => {
      try {
        pipe.transform({ email: 'pas-un-email', age: '30' });
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Les données envoyées sont invalides',
      errors: [{ field: 'email', message: expect.any(String) }],
    });
  });

  it('nomme chaque champ fautif quand il y en a plusieurs', () => {
    // C'est l'assertion qui aurait attrapé le bug : parcourir la liste des
    // problèmes. Avec `.errors` undefined, le pipe plantait ici.
    const error = (() => {
      try {
        pipe.transform({ email: 'pas-un-email', age: '12' });
      } catch (e) {
        return e as BadRequestException;
      }
    })();

    const body = error!.getResponse() as {
      errors: { field: string }[];
    };

    expect(body.errors.map((e) => e.field).sort()).toEqual(['age', 'email']);
  });
});
