import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { QueryFailedError, type EntityManager } from 'typeorm';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { makeUser } from '../../../test/fixtures/user.fixture.js';

const mockUserRepository = {
  findOne: vi.fn(),
};

const mockManager = {
  create: vi.fn(),
  save: vi.fn(),
};

const mockDataSource = {
  getRepository: vi.fn().mockReturnValue(mockUserRepository),
  transaction: vi.fn((work: (manager: EntityManager) => Promise<unknown>) =>
    work(mockManager as unknown as EntityManager),
  ),
};

const mockProfilesService = {
  createForUser: vi.fn(),
};

/**
 * Email inconnu et mot de passe faux doivent renvoyer EXACTEMENT ceci.
 * La constante partagée rend l'intention explicite : si les deux réponses
 * divergeaient un jour, le temps de réponse ne serait plus la seule fuite.
 */
const INVALID_CREDENTIALS = {
  code: 'INVALID_CREDENTIALS',
  message: 'Email ou mot de passe invalide',
};

const PASSWORD = 'un-mot-de-passe-valide';

/** Ce que renvoie l'API quand l'email est déjà pris, par les deux chemins. */
const EMAIL_TAKEN = {
  code: 'EMAIL_TAKEN',
  message: 'Cet email est déjà utilisé',
};

/**
 * L'erreur que TypeORM lève quand Postgres refuse une insertion pour
 * violation de contrainte d'unicité. 23505 est le code de Postgres.
 */
function uniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT INTO users', [], {
    code: '23505',
  } as never);
}

describe('AuthService', () => {
  let service: AuthService;
  let passwordHash: string;

  // argon2 est volontairement lent. On paie le hachage une fois pour le
  // fichier, pas à chaque test.
  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        {
          provide: JwtService,
          useValue: { signAsync: vi.fn().mockResolvedValue('un-jeton') },
        },
        { provide: ProfilesService, useValue: mockProfilesService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    vi.resetAllMocks();
    mockDataSource.getRepository.mockReturnValue(mockUserRepository);
    mockDataSource.transaction.mockImplementation(
      (work: (manager: EntityManager) => Promise<unknown>) =>
        work(mockManager as unknown as EntityManager),
    );
  });

  describe('register', () => {
    it('refuse un email déjà utilisé', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(makeUser());

      const error = await service
        .register({
          email: 'user@example.com',
          password: PASSWORD,
          name: 'Test User',
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(EMAIL_TAKEN);
    });

    it('inscrit un utilisateur, crée son profil dans la même transaction, et ne renvoie jamais le hash', async () => {
      // Aucun utilisateur existant : la pré-vérification laisse passer.
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      const saved = makeUser({ email: 'nouveau@example.com', name: 'Lewis' });
      mockManager.create.mockReturnValueOnce(saved);
      mockManager.save.mockResolvedValueOnce(saved);

      const result = await service.register({
        email: saved.email,
        password: PASSWORD,
        name: 'Lewis',
      });

      expect(result).toEqual({
        id: saved.id,
        email: saved.email,
        name: saved.name,
        createdAt: saved.createdAt,
      });
      // Le profil est créé AVEC le manager de la transaction, pas après —
      // sinon rien ne garantit l'atomicité avec la création de l'utilisateur.
      expect(mockProfilesService.createForUser).toHaveBeenCalledWith(
        mockManager,
        saved.id,
        'Lewis',
      );
    });

    it('reprend une chaîne vide quand le nom n est pas fourni à l inscription', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(null);
      const saved = makeUser({ name: null });
      mockManager.create.mockReturnValueOnce(saved);
      mockManager.save.mockResolvedValueOnce(saved);

      await service.register({ email: saved.email, password: PASSWORD });

      expect(mockProfilesService.createForUser).toHaveBeenCalledWith(
        mockManager,
        saved.id,
        '',
      );
    });

    it('hache le mot de passe au lieu de le stocker en clair', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(null);
      const saved = makeUser();
      mockManager.create.mockReturnValueOnce(saved);
      mockManager.save.mockResolvedValueOnce(saved);

      await service.register({ email: saved.email, password: PASSWORD });

      // On ne vérifie pas COMMENT c'est haché — on vérifie que ce qui part
      // vers la base n'est pas le mot de passe en clair, et qu'argon2 le
      // reconnaît. Ces deux assertions survivraient à un changement de
      // bibliothèque de hachage. manager.create(User, data) : le deuxième
      // argument est la donnée, le premier la classe de l'entité.
      const [, persisted] = mockManager.create.mock.calls[0] as [
        unknown,
        { passwordHash: string },
      ];

      expect(persisted.passwordHash).not.toBe(PASSWORD);
      await expect(
        argon2.verify(persisted.passwordHash, PASSWORD),
      ).resolves.toBe(true);
    });

    it('traduit une violation de contrainte en 409', async () => {
      // La pré-vérification ne trouve rien : c'est le cas de la course entre
      // deux inscriptions simultanées. La base est la seule à trancher.
      mockUserRepository.findOne.mockResolvedValueOnce(null);
      mockDataSource.transaction.mockRejectedValueOnce(uniqueViolation());

      const error = await service
        .register({ email: 'course@example.com', password: PASSWORD })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual(EMAIL_TAKEN);
    });

    it('laisse remonter une erreur de base qui n est pas un doublon', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      const panne = new Error('connexion perdue');
      mockDataSource.transaction.mockRejectedValueOnce(panne);

      const error = await service
        .register({ email: 'panne@example.com', password: PASSWORD })
        .catch((e) => e);

      // Surtout PAS un 409 : une panne réseau déguisée en « email déjà pris »
      // enverrait l'utilisateur chercher un problème qui n'existe pas.
      expect(error).toBe(panne);
      expect(error).not.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('refuse un email inconnu', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      const error = await service
        .login({ email: 'inconnu@example.com', password: PASSWORD })
        .catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toEqual(INVALID_CREDENTIALS);
    });

    it('refuse un mot de passe incorrect, à l identique', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(
        makeUser({ passwordHash }),
      );

      const error = await service
        .login({ email: 'user@example.com', password: PASSWORD + '-faux' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toEqual(INVALID_CREDENTIALS);
    });

    it('cherche en base avec l email demandé', async () => {
      // Le faux repository renvoie le même utilisateur quoi qu'on lui
      // demande : sans cette assertion, un service qui chercherait toujours
      // le même email passerait tous les autres tests.
      mockUserRepository.findOne.mockResolvedValueOnce(
        makeUser({ passwordHash }),
      );

      await service.login({ email: 'user@example.com', password: PASSWORD });

      expect(mockUserRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'user@example.com' } }),
      );
    });

    it('accepte le bon mot de passe et ne renvoie jamais le hash', async () => {
      const user = makeUser({ passwordHash });
      mockUserRepository.findOne.mockResolvedValueOnce(user);

      const result = await service.login({
        email: user.email,
        password: PASSWORD,
      });

      // toEqual sur l'objet ENTIER : le test échoue si une clé en trop
      // apparaît, donc une fuite de passwordHash est attrapée ici.
      expect(result).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        autoApplyEnabled: user.autoApplyEnabled,
        createdAt: user.createdAt,
        token: 'un-jeton',
      });
    });
  });
});
