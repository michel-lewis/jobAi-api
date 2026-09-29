import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Exécute un schéma Zod sur la valeur entrante avant que le handler ne soit
 * appelé. Un type TypeScript disparaît à la compilation : sans ce pipe, rien
 * ne valide le corps de la requête à l'exécution.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Les données envoyées sont invalides',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
