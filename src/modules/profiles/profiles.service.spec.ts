import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ProfilesService } from './profiles.service.js';
import { Profile } from './entities/profile.entity.js';
import { makeProfile } from '../../../test/fixtures/profile.fixture.js';

const mockProfileRepository = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
};

const USER_ID = '3f1a9c2e-5b7d-4e8a-9c1f-2d6b8e4a7c05';

const PROFILE_EXISTS = {
  code: 'PROFILE_EXISTS',
  message: 'Un profil existe déjà pour cet utilisateur',
};

const PROFILE_NOT_FOUND = {
  code: 'PROFILE_NOT_FOUND',
  message: "Aucun profil n'existe pour cet utilisateur",
};

/**
 * L'erreur que TypeORM lève quand Postgres refuse une insertion pour
 * violation de contrainte d'unicité. 23505 est le code de Postgres.
 */
function uniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT INTO profiles', [], {
    code: '23505',
  } as never);
}

describe('ProfilesService', () => {
  let service: ProfilesService;
  let repository: typeof mockProfileRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: getRepositoryToken(Profile),
          useValue: mockProfileRepository,
        },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
    repository = module.get<typeof mockProfileRepository>(
      getRepositoryToken(Profile),
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('refuse si un profil existe déjà', async () => {
      repository.findOne.mockResolvedValueOnce(makeProfile());

      const error = await service
        .create(USER_ID, {
          professionalInformation: 'x',
          personalInformation: 'y',
          education: 'z',
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(PROFILE_EXISTS);
    });

    it('crée le profil et renvoie un DTO sans le champ user', async () => {
      repository.findOne.mockResolvedValueOnce(null);
      const saved = makeProfile({ userId: USER_ID });
      repository.create.mockReturnValueOnce(saved);
      repository.save.mockResolvedValueOnce(saved);

      const result = await service.create(USER_ID, {
        professionalInformation: saved.professionalInformation,
        personalInformation: saved.personalInformation,
        education: saved.education,
        location: saved.location,
      });

      expect(result).toEqual({
        id: saved.id,
        professionalInformation: saved.professionalInformation,
        personalInformation: saved.personalInformation,
        education: saved.education,
        location: saved.location,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      });
    });

    it('traduit une violation de contrainte en 409', async () => {
      // La pré-vérification ne trouve rien : c'est le cas de la course entre
      // deux créations simultanées. La base est la seule à trancher.
      repository.findOne.mockResolvedValueOnce(null);
      repository.create.mockReturnValueOnce(makeProfile());
      repository.save.mockRejectedValueOnce(uniqueViolation());

      const error = await service
        .create(USER_ID, {
          professionalInformation: 'x',
          personalInformation: 'y',
          education: 'z',
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(PROFILE_EXISTS);
    });

    it('laisse remonter une erreur de base qui n est pas un doublon', async () => {
      repository.findOne.mockResolvedValueOnce(null);
      repository.create.mockReturnValueOnce(makeProfile());

      const panne = new Error('connexion perdue');
      repository.save.mockRejectedValueOnce(panne);

      const error = await service
        .create(USER_ID, {
          professionalInformation: 'x',
          personalInformation: 'y',
          education: 'z',
        })
        .catch((e) => e);

      expect(error).toBe(panne);
      expect(error).not.toBeInstanceOf(ConflictException);
    });
  });

  describe('findMine', () => {
    it('renvoie 404 quand aucun profil n existe', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const error = await service.findMine(USER_ID).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toEqual(PROFILE_NOT_FOUND);
    });

    it('transmet le userId reçu à la base', async () => {
      const mine = makeProfile({
        userId: USER_ID,
        professionalInformation: 'le mien',
      });
      const AUTRE_USER_ID = 'c2e1a9f3-5b7d-4e8a-9c1f-2d6b8e4a7c99';

      // Un faux repository qui se comporte comme Postgres : il ne rend que
      // la ligne dont le user_id correspond à la clause where demandée.
      repository.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.userId === USER_ID ? mine : null),
      );

      const result = await service.findMine(USER_ID);
      const error = await service.findMine(AUTRE_USER_ID).catch((e) => e);

      expect(result.professionalInformation).toBe('le mien');
      expect(error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('renvoie 404 quand aucun profil n existe', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const error = await service
        .update(USER_ID, { location: 'Lyon' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toEqual(PROFILE_NOT_FOUND);
    });

    it('ne modifie que les champs fournis', async () => {
      const existing = makeProfile({ userId: USER_ID, location: 'Paris' });
      repository.findOne.mockResolvedValueOnce(existing);
      repository.save.mockImplementationOnce((p) => Promise.resolve(p));

      const result = await service.update(USER_ID, { location: 'Lyon' });

      expect(result.location).toBe('Lyon');
      expect(result.professionalInformation).toBe(
        existing.professionalInformation,
      );
    });
  });
});
