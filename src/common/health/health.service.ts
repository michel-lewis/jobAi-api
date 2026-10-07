import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Un seul aller-retour trivial contre la base. Pas de détail renvoyé par
 * cette méthode — c'est au contrôleur de décider ce que le client en voit.
 */
@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async isHealthy(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
