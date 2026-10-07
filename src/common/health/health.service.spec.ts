import { DataSource } from 'typeorm';
import { HealthService } from './health.service.js';

const mockDataSource = {
  query: vi.fn(),
};

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService(mockDataSource as unknown as DataSource);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renvoie true quand la base répond', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);

    await expect(service.isHealthy()).resolves.toBe(true);
  });

  it('renvoie false quand la base ne répond pas', async () => {
    mockDataSource.query.mockRejectedValueOnce(new Error('connexion perdue'));

    await expect(service.isHealthy()).resolves.toBe(false);
  });
});
